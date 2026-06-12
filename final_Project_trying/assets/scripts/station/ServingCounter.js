const StationBase = require('./StationBase');
const OrderManager = require('./OrderManager');
const EventBus = require('../core/EventBus');

const ServingCounter = cc.Class({
    extends: StationBase,

    onLoad() {
        if (StationBase.prototype.onLoad) StationBase.prototype.onLoad.call(this);
        this._currentSubmission = null;
        // 已放但還沒湊齊的食材實體 sprite，堆在桌上方供視覺反饋。
        // 不再用畫面中央的 Buffer UI（位置奇怪、會擋畫面）。
        this._stagedItems = [];
        // 當鎖定的訂單過期/被完成時，要把當前 submission 一起重置 + 清掉桌上殘留，
        // 順便保險 emit buffer:clear 蓋掉舊版本可能殘留的中央 buffer UI。
        this._onOrderRemoved = this._onOrderRemoved.bind(this);
        EventBus.on('order:expired', this._onOrderRemoved);
        EventBus.on('order:completed', this._onOrderRemoved);
    },

    onDestroy() {
        EventBus.off('order:expired', this._onOrderRemoved);
        EventBus.off('order:completed', this._onOrderRemoved);
        if (StationBase.prototype.onDestroy) StationBase.prototype.onDestroy.call(this);
    },

    _onOrderRemoved(data) {
        // 本桌正在進行的單跟事件對得上 → 清；遠端 stage 進來的桌（_currentSubmission=null）
        // 也用 _remoteStageOrderId 比對 → 清。其他無關訂單跳過，避免誤清其他桌的暫存。
        const localId  = this._currentSubmission && this._currentSubmission.orderId;
        const remoteId = this._remoteStageOrderId;
        const targetId = data && data.id;
        if (localId == null && remoteId == null) return;
        if (targetId != null && targetId !== localId && targetId !== remoteId) return;
        cc.log('[ServingCounter] 訂單', targetId, '已被移除，重置 submission + 清桌上食材');
        this._currentSubmission = null;
        this._remoteStageOrderId = null;
        this._clearStagedItems();
        EventBus.emit('buffer:clear');
    },

    _clearStagedItems() {
        if (!this._stagedItems) { this._stagedItems = []; return; }
        for (const it of this._stagedItems) {
            if (it && cc.isValid(it)) it.destroy();
        }
        this._stagedItems = [];
    },

    _addStagedItem(item) {
        if (!item) return;
        item.parent = this.node;
        // 水平排列在桌上方一點，最多 3 個（full_meal 上限）。
        // ServingCounter 透過 StationBase 應用 visualScale=1.45，桌子本身大約一格寬，
        // 在桌上方 +50 的 y 偏移可以避開站台底圖、又不會跑出畫面。
        const idx = this._stagedItems.length;
        const spacing = 32;
        const totalWidth = (3 - 1) * spacing;
        item.x = idx * spacing - totalWidth / 2;
        item.y = this.itemOffsetY + 50;
        this._setItemDisplayOnStation(item);
        this._stagedItems.push(item);
    },

    _normalizeItemName(itemName) {
        // 確保這裡的對應關係與你的實際物品名稱一致
        const nameMap = {
            'raw_meat': 'meat',
            'bread': 'bread',
            'onion': 'onion',
            'tomato': 'tomato',
            'toast': 'toast',
            'chocolate_jam': 'chocolate_jam',
            'black_tea': 'black_tea',
            'hamburger': 'hamburger', // 確保這些是你實際產出的成品名稱
            'chocolate_toast': 'chocolate_toast'
        };
        return nameMap[itemName] || itemName;
    },

    _onPlace(player) {
        const item = player.dropItem();
        if (!item) return;

        const itemName = this._normalizeItemName(item.name);
        
        // 1. 如果已有湊單進度
        if (this._currentSubmission) {
            // 檢查訂單是否還有效
            const order = OrderManager.instance.getOrderById(this._currentSubmission.orderId);
            if (!order) {
                cc.log('⚠️ 訂單已過期/不存在，重置 submission');
                this._currentSubmission = null;
                this._clearStagedItems();
                EventBus.emit('buffer:clear');
            } else {
                // 成品直接結案檢查
                if (itemName === this._currentSubmission.recipe) {
                    this._completeSubmission(item);
                    return;
                }
                // 食材湊單檢查
                const needed = this._getRequiredItems(this._currentSubmission.recipe);
                if (!needed.includes(itemName)) {
                    player.pickUp(item);
                    return;
                }
            }
        } 
        
        // 2. 如果沒有湊單進度 (或是上面剛被重置為 null)，嘗試尋找訂單
        if (!this._currentSubmission) {
            const urgentIdx = OrderManager.instance._findOldestOrderWithIngredient(itemName);
            if (urgentIdx === -1) {
                player.pickUp(item);
                return;
            }
            
            const orders = OrderManager.instance.getOrders();
            const orderData = orders[urgentIdx];
            const order = OrderManager.instance.getOrderById(orderData.id);
            
            if (!order) {
                player.pickUp(item);
                return;
            }

            // 【補齊初始化邏輯】
            this._currentSubmission = {
                orderId: order.id,
                recipe: order.recipe,
                submittedItems: []
            };

            // 如果丟入的是成品，直接結案
            if (itemName === order.recipe) {
                this._completeSubmission(item);
                return;
            }
        }

        // 3. 處理食材入庫：把食材實體放在桌上方視覺反饋（不 destroy）
        this._currentSubmission.submittedItems.push(itemName);
        this._addStagedItem(item);

        // 通知對方：把我頭上 ghost 取下，移到 ServingCounter 桌上（同步暫存區）。
        // 帶 orderId，讓對方端 _onOrderRemoved 看到對應訂單被消費/過期時，也能精確清掉桌上暫存。
        cc.log('[ServingCounter] emit station:stage item=', itemName);
        EventBus.emit('station:stage', {
            col:     this.gridCol,
            row:     this.gridRow,
            item:    itemName,
            orderId: this._currentSubmission.orderId,
        });

        // 4. 檢查是否湊齊
        if (this._checkCompletion(this._currentSubmission)) {
            this._completeSubmission(null);
        }
    },

    _completeSubmission(item) {
        if (item) item.destroy();
        this._clearStagedItems();

        // 1. 先記錄 ID 並執行訂單消耗邏輯
        // 注意：OrderManager.consumeOrderById 內部「已經」addScore 並 emit 'order:completed'，
        // 這裡不要再加一次，否則本地端會雙倍加分（reward × 2），加上 EV_SCORE_SYNC 同步到
        // 對方時，對方也會因為 _applyRemoteServe 再 consumeOrderById 而多加，最後變 3~4 倍。
        const orderId = this._currentSubmission.orderId;
        const recipe = this._currentSubmission.recipe;
        const result = OrderManager.instance.consumeOrderById(orderId);

        if (result.found) {
            // 通知對方：我成功出餐了，請從你那邊也把訂單移掉、清掉我頭上的 ghost item。
            // GameNetworkBridge 監聽 'station:serve' → 廣播 EV_SERVE。
            cc.log('[ServingCounter] emit station:serve orderId=', orderId, 'recipe=', recipe);
            EventBus.emit('station:serve', {
                success: true,
                col:     this.gridCol,
                row:     this.gridRow,
                item:    recipe,
                orderId: orderId,
            });
        }

        // 保險：emit buffer:clear 蓋掉舊 buffer UI 可能殘留
        EventBus.emit('buffer:clear');
        this._currentSubmission = null;
    },

    _checkCompletion(submission) {
        const needed = this._getRequiredItems(submission.recipe);
        const submitted = [...submission.submittedItems];
        for (const item of needed) {
            const idx = submitted.indexOf(item);
            if (idx === -1) return false;
            submitted.splice(idx, 1);
        }
        return true;
    },

    _getRequiredItems(recipe) {
        // 重要：這裡的名稱必須與你 FoodBox 或烹飪台最終產出的物品名稱一致
        const recipesMap = {
            'full_meal': ['hamburger', 'black_tea', 'chocolate_toast'],
            'burger_tea': ['hamburger', 'black_tea'],
            'toast_tea': ['chocolate_toast', 'black_tea'],
            'burger_toast': ['hamburger', 'chocolate_toast']
        };
        return recipesMap[recipe] || [recipe];
    },

    _onPickup(player) { cc.log('[ServingCounter] 不能取回。'); }
});

module.exports = ServingCounter;