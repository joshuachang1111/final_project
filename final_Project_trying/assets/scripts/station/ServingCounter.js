const StationBase = require('./StationBase');
const OrderManager = require('./OrderManager');
const EventBus = require('../core/EventBus');

const ServingCounter = cc.Class({
    extends: StationBase,

    onLoad() {
        if (StationBase.prototype.onLoad) StationBase.prototype.onLoad.call(this);
        this._currentSubmission = null;
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

        // 3. 處理食材入庫
        this._currentSubmission.submittedItems.push(itemName);
        item.destroy();
        EventBus.emit('buffer:update', { items: this._currentSubmission.submittedItems });

        // 4. 檢查是否湊齊
        if (this._checkCompletion(this._currentSubmission)) {
            this._completeSubmission(null);
        }
    },

    _completeSubmission(item) {
        if (item) item.destroy();
        
        // 1. 先記錄 ID 並執行訂單消耗邏輯
        const orderId = this._currentSubmission.orderId;
        const recipe = this._currentSubmission.recipe;
        const result = OrderManager.instance.consumeOrderById(orderId);
        
        if (result.found) {
            EventBus.emit('order:completed', { id: orderId, recipe: recipe });
            
            // 使用安全呼叫，避免因為找不到 GameManager 而崩潰
            if (typeof GameManager !== 'undefined' && GameManager.instance) {
                GameManager.instance.addScore(result.reward);
            } else {
                cc.log('[ServingCounter] GameManager 未定義，無法加分，但訂單已處理');
            }
        }
        
        // 2. 這兩行是 UI 消失的關鍵，必須確保執行
        cc.log('[ServingCounter] 發送 buffer:clear');
        EventBus.emit('buffer:clear');
        
        // 3. 重置狀態
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