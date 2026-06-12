const EventBus    = require('../core/EventBus');
const GameManager = require('../core/GameManager');
const ItemSprites = require('../station/ItemSpriteRegistry');

// ── 圖片名稱對照表 ──────────────────────────────────────────
const RECIPE_TO_IMAGE = {
    'burger_tea':           'order1',
    'toast_tea':            'order2',
    'burger_toast':         'order3',
    'hamburger':               'order4',
    'chocolate_toast':      'order5',
    'black_tea':            'order6',
    'full_meal':            'order7'
};

const LEVEL2_RECIPE_ICONS = {
    box_iPhone: ['iPhone_checked'],
    box_Airpods: ['Airpods_checked'],
    box_charger: ['charger_checked'],
    box_iPhone_Airpods: ['iPhone_checked', 'Airpods_checked'],
    box_iPhone_charger: ['iPhone_checked', 'charger_checked'],
    box_Airpods_charger: ['Airpods_checked', 'charger_checked'],
    box_all: ['iPhone_checked', 'Airpods_checked', 'charger_checked'],
};
// ─────────────────────────────────────────────────────────

// game.fire 有兩個 OrderContainer 節點同時掛 component（一個在 Canvas 直接子、
// 一個在 HUD 子節點），都會接 order:added → 每筆訂單建立兩份卡片導致 UI 重複。
//
// 策略：在 _onOrderAdded 用 module-level Map 追蹤已建立的 order id，第一個收到
// 事件的 instance 建立卡片並記錄，後續 instance 收到同 id 直接 skip。
// 兩個 instance 都監聽事件 → 不會因為「挑錯 instance」而完全看不到訂單。
// 場景切換時 onDestroy 會清掉 active set。
const _activeCards = new Map(); // id → owner OrderContainer instance

cc.Class({
    extends: cc.Component,

    properties: {
        foodSpriteFrames: {
            default: [],
            type: [cc.SpriteFrame],
            tooltip: '請將 order1 到 order7 的圖片拖入此處',
        },
    },

    onLoad() {
        const parentName = this.node.parent ? this.node.parent.name : '(no parent)';
        cc.log('[OrderContainer] onLoad, parent=', parentName);

        if (EventBus && typeof EventBus.on === 'function') {
            EventBus.on('order:added', this._onOrderAdded, this);
            EventBus.on('order:completed', this._onOrderRemoved, this);
            EventBus.on('order:expired', this._onOrderRemoved, this);
            cc.log('[OrderContainer] 訂單事件監聽已設置 (parent=' + parentName + ')');
        } else {
            cc.error('[OrderContainer] EventBus 不存在或沒有 on 方法！');
        }
    },

    onDestroy() {
        // 清掉本 instance 持有的卡片紀錄（場景切換時把 Map 內 owner 是自己的 entry 清掉）
        for (const [id, owner] of _activeCards) {
            if (owner === this) _activeCards.delete(id);
        }
        if (EventBus && typeof EventBus.off === 'function') {
            EventBus.off('order:added', this._onOrderAdded, this);
            EventBus.off('order:completed', this._onOrderRemoved, this);
            EventBus.off('order:expired', this._onOrderRemoved, this);
        }
    },

    _onOrderAdded(data) {
        // game.fire 有兩個 OrderContainer 節點：Canvas 直接子（孤兒、被別的 UI 蓋住看不見）
        // 與 HUD 內（隊友後加的、跟 Timerlabel/Scorelabel 同容器，視覺對的版本）。
        // 強制 HUD 內那個 win，Canvas 直接子的 skip。
        const parentName = this.node.parent ? this.node.parent.name : '';
        if (parentName !== 'HUD') {
            return;
        }
        _activeCards.set(data.id, this);

        cc.log('[OrderUIHandler] 生成新訂單，ID:', data.id, 'parent=', this.node.parent && this.node.parent.name);

        // 防禦檢查：確保節點存在
        if (!this.node) {
            cc.error('[OrderContainer] this.node 是 null，無法創建訂單！');
            return;
        }

        // 1. 建立訂單主節點（❌ 這裡完全不加任何 cc.Label，保證沒有任何字）
        const orderNode = new cc.Node('order_' + data.id);
        orderNode.parent = this.node; 

        orderNode.timeLeft = data.timeLeft;
        orderNode.maxTime  = data.timeLeft;
        // 記下加入瞬間 GameManager 的 elapsed，update 用 wall-clock 反算 timeLeft，
        // 視窗最小化恢復後 UI 倒數會跟主時間器一起補回錯過的秒數。
        orderNode.spawnElapsed = GameManager.instance ? GameManager.instance.elapsed : null;

        // 2. 動態建立「食物圖片」
        const foodNode = new cc.Node('FoodIcon');
        const level2Icons = LEVEL2_RECIPE_ICONS[data.recipe];
        if (level2Icons) {
            this._buildLevel2OrderIcons(foodNode, level2Icons);
        } else {
        const spriteComp = foodNode.addComponent(cc.Sprite);

        const targetImageName = RECIPE_TO_IMAGE[data.recipe] || data.recipe;
        cc.log('[OrderContainer] 尋找圖片:', targetImageName, 'recipe=', data.recipe);

        let frame = null;
        if (Array.isArray(this.foodSpriteFrames)) {
            cc.log('[OrderContainer] foodSpriteFrames 數量=', this.foodSpriteFrames.length);
            this.foodSpriteFrames.forEach((f, idx) => {
                if (f) cc.log('[OrderContainer]   [' + idx + '] name=', f.name);
            });
            frame = this.foodSpriteFrames.find(f => f && f.name === targetImageName);
        } else {
            cc.error('[OrderContainer] foodSpriteFrames 不是陣列！', this.foodSpriteFrames);
        }

        if (frame) {
            cc.log('[OrderContainer] ✓ 找到圖片，名稱=', frame.name);
            spriteComp.spriteFrame = frame;
            foodNode.setContentSize(frame.getRect().width, frame.getRect().height);
        } else {
            cc.warn(`[OrderContainer] ✗ 找不到圖片資源: ${targetImageName}`);
            foodNode.setContentSize(120, 100);
        }
        }
        
        // 調整食物稍微往下移，把上方的空間留給超大時間條
        foodNode.setPosition(0, level2Icons ? 20 : -20);
        foodNode.parent = orderNode;

        // --- 新增：建立 Label 顯示時間 ---
        const labelNode = new cc.Node('TimeLabel');
        labelNode.parent = orderNode;
        if (level2Icons) labelNode.setPosition(0, -170);
        labelNode.setPosition(0, -230); // 調整至你喜歡的 Y 軸高度
        const labelComp = labelNode.addComponent(cc.Label);
        if (level2Icons) labelNode.setPosition(0, -170);
        labelComp.fontSize = 60;
        labelComp.string = Math.ceil(data.timeLeft) + 's';
        orderNode.timeLabel = labelComp; // 存起來，給 update 用

        // 3. ✨ 動態建立「時間條」子節點（放大版 ＋ 移到上面）
        const barNode = new cc.Node('TimeBar');
        barNode.parent = orderNode;
        
        // 💡 放大設定：寬度比食物圖寬 20 像素，高度加粗到 32 像素
        const barWidth = foodNode.width - 40;
        const barHeight = 40; 

        // 🎯 移到上面：定位在食物圖片的上方
        barNode.setPosition(-barWidth / 2, level2Icons ? -80 : (foodNode.height / 2) - 80);
        
        const ctx = barNode.addComponent(cc.Graphics);
        orderNode.timeBarCtx = ctx; 
        orderNode.barWidth = barWidth;
        orderNode.barHeight = barHeight;

        // 初始繪製滿血大時間條
        this._drawProgressBar(ctx, barWidth, barHeight, 1.0); 

        // 調整主節點總尺寸（給予足夠的 Layout 空間避免重疊）
        orderNode.setContentSize(barWidth, level2Icons ? 230 : foodNode.height + barHeight + 40);

        // 通知 Layout 重新排隊
        const layout = this.node.getComponent(cc.Layout);
        if (layout) {
            layout.updateLayout();
        }
    },

    // ── 🔄 每幀自動更新時間條 ──────────────────────────────────
    update(dt) {
        if (!this.node || this.node.childrenCount === 0) return;
        const currentElapsed = GameManager.instance ? GameManager.instance.elapsed : null;

        this.node.children.forEach(orderNode => {
            if (orderNode && orderNode.timeLeft !== undefined && orderNode.timeBarCtx) {
                if (typeof orderNode.spawnElapsed === 'number' && currentElapsed !== null) {
                    // Wall-clock based：用 GameManager.elapsed 算，視窗最小化恢復會自動補回
                    orderNode.timeLeft = Math.max(0, orderNode.maxTime - (currentElapsed - orderNode.spawnElapsed));
                } else {
                    // Fallback：相容沒有 spawnElapsed 的舊節點
                    orderNode.timeLeft -= dt;
                    if (orderNode.timeLeft < 0) orderNode.timeLeft = 0;
                }

                if (orderNode.timeLabel) {
                    orderNode.timeLabel.string = Math.ceil(orderNode.timeLeft) + 's';
                }

                const ratio = orderNode.maxTime > 0 ? orderNode.timeLeft / orderNode.maxTime : 0;
                this._drawProgressBar(orderNode.timeBarCtx, orderNode.barWidth, orderNode.barHeight, ratio);
            }

            EventBus.emit('hud:order_tick', {
                id: orderNode.name.replace('order_', ''),
                timeLeft: orderNode.timeLeft,
            });
        });
    },

    _onOrderRemoved(data) {
        if (!this.node) return;
        // 不論本 instance 是不是 owner，都嘗試移除本身內的 'order_X' 節點，避免有殘留
        const orderNode = this.node.getChildByName('order_' + data.id);
        if (orderNode) {
            const visualTimeLeft = typeof orderNode.timeLeft === 'number' ? orderNode.timeLeft.toFixed(2) : '?';
            cc.log('[OrderUI-Remove] id=', data.id, '視覺 timeLeft=', visualTimeLeft);
            orderNode.removeFromParent();
            orderNode.destroy();

            const layout = this.node.getComponent(cc.Layout);
            if (layout) {
                layout.updateLayout();
            }
        }
        if (_activeCards.get(data.id) === this) _activeCards.delete(data.id);
    },

    // ── 🎨 核心繪圖邏輯（灰色底、綠色隨時間由右向左減少） ──
    _buildLevel2OrderIcons(foodNode, iconNames) {
        const iconSize = 72;
        const spacing = 62;
        const width = Math.max(120, (iconNames.length - 1) * spacing + iconSize);

        foodNode.setContentSize(width, 100);

        iconNames.forEach((iconName, index) => {
            const iconNode = new cc.Node('Icon_' + iconName);
            const sprite = iconNode.addComponent(cc.Sprite);
            sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            iconNode.parent = foodNode;
            iconNode.setContentSize(iconSize, iconSize);
            iconNode.x = index * spacing - ((iconNames.length - 1) * spacing / 2);
            iconNode.y = 0;

            this._loadSpriteFromRegistry(sprite, iconNode, iconName);
        });
    },

    _loadSpriteFromRegistry(spriteComp, node, itemName) {
        const uuid = ItemSprites.ITEM_SPRITE_UUIDS && ItemSprites.ITEM_SPRITE_UUIDS[itemName];
        if (!uuid || !cc.assetManager || !cc.assetManager.loadAny) {
            cc.warn('[OrderContainer] 找不到第二關訂單圖片:', itemName);
            return;
        }

        cc.assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset || !cc.isValid(node) || !cc.isValid(spriteComp.node)) {
                if (err) cc.warn('[OrderContainer] 第二關訂單圖片載入失敗:', itemName, err);
                return;
            }

            spriteComp.spriteFrame = asset;
        });
    },

    _drawProgressBar(ctx, w, h, ratio) {
        ctx.clear();

        // 1. 先畫整條底層：灰色
        ctx.fillColor = cc.Color.GRAY;
        ctx.rect(0, 0, w, h);
        ctx.fill();

        // 2. 再畫上層：綠色
        ctx.fillColor = cc.Color.GREEN;
        ctx.rect(0, 0, w * ratio, h);
        ctx.fill();
    }
});
