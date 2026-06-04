const EventBus = require('../core/EventBus');

// ── 圖片名稱對照表 ──────────────────────────────────────────
const RECIPE_TO_IMAGE = {
    'burger':            'order1',
    'chocolate_toast':   'order2',
    'black_tea':         'order3',
    'burger_tea':        'order4',
    'toast_tea':         'order5',
    'burger_toast':      'order6',
    'full_meal':         'order7'
};
// ─────────────────────────────────────────────────────────

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
        cc.log('[OrderContainer] onLoad, this.node=', !!this.node);

        if (EventBus && typeof EventBus.on === 'function') {
            EventBus.on('order:added', this._onOrderAdded, this);
            EventBus.on('order:completed', this._onOrderRemoved, this);
            EventBus.on('order:expired', this._onOrderRemoved, this);
            cc.log('[OrderContainer] 訂單事件監聽已設置');
        } else {
            cc.error('[OrderContainer] EventBus 不存在或沒有 on 方法！');
        }
    },

    onDestroy() {
        if (EventBus && typeof EventBus.off === 'function') {
            EventBus.off('order:added', this._onOrderAdded, this);
            EventBus.off('order:completed', this._onOrderRemoved, this);
            EventBus.off('order:expired', this._onOrderRemoved, this);
        }
    },

    _onOrderAdded(data) {
        cc.log('[OrderUIHandler] 生成新訂單，ID:', data.id);

        // 防禦檢查：確保節點存在
        if (!this.node) {
            cc.error('[OrderContainer] this.node 是 null，無法創建訂單！');
            return;
        }

        // 1. 建立訂單主節點（❌ 這裡完全不加任何 cc.Label，保證沒有任何字）
        const orderNode = new cc.Node('order_' + data.id);
        orderNode.parent = this.node; 

        orderNode.timeLeft = data.timeLeft;
        orderNode.maxTime = data.timeLeft;

        // 2. 動態建立「食物圖片」
        const foodNode = new cc.Node('FoodIcon');
        const spriteComp = foodNode.addComponent(cc.Sprite);
        
        const targetImageName = RECIPE_TO_IMAGE[data.recipe] || data.recipe;

        let frame = null;
        if (Array.isArray(this.foodSpriteFrames)) {
            frame = this.foodSpriteFrames.find(f => f && f.name === targetImageName);
        }

        if (frame) {
            spriteComp.spriteFrame = frame;
            foodNode.setContentSize(frame.getRect().width, frame.getRect().height);
        } else {
            cc.warn(`[OrderUIHandler] 找不到圖片資源: ${targetImageName}`);
            foodNode.setContentSize(120, 100); 
        }
        
        // 調整食物稍微往下移，把上方的空間留給超大時間條
        foodNode.setPosition(0, -20);
        foodNode.parent = orderNode;

        // --- 新增：建立 Label 顯示時間 ---
        const labelNode = new cc.Node('TimeLabel');
        labelNode.parent = orderNode;
        labelNode.setPosition(0, -230); // 調整至你喜歡的 Y 軸高度
        const labelComp = labelNode.addComponent(cc.Label);
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
        barNode.setPosition(-barWidth / 2, (foodNode.height / 2) - 80);
        
        const ctx = barNode.addComponent(cc.Graphics);
        orderNode.timeBarCtx = ctx; 
        orderNode.barWidth = barWidth;
        orderNode.barHeight = barHeight;

        // 初始繪製滿血大時間條
        this._drawProgressBar(ctx, barWidth, barHeight, 1.0); 

        // 調整主節點總尺寸（給予足夠的 Layout 空間避免重疊）
        orderNode.setContentSize(barWidth, foodNode.height + barHeight + 40);

        // 通知 Layout 重新排隊
        const layout = this.node.getComponent(cc.Layout);
        if (layout) {
            layout.updateLayout();
        }
    },

    // ── 🔄 每幀自動更新時間條 ──────────────────────────────────
    update(dt) {
        if (!this.node || this.node.childrenCount === 0) return;

        this.node.children.forEach(orderNode => {
            if (orderNode && orderNode.timeLeft !== undefined && orderNode.timeBarCtx) {
                orderNode.timeLeft -= dt;
                if (orderNode.timeLeft < 0) orderNode.timeLeft = 0;

                // --- 核心修改：直接更新 label ---
                if (orderNode.timeLabel) {
                    orderNode.timeLabel.string = Math.ceil(orderNode.timeLeft) + 's';
                }

                const ratio = orderNode.timeLeft / orderNode.maxTime;

                // 畫大時間條（寬度、高度32、由右向左減少）
                this._drawProgressBar(orderNode.timeBarCtx, orderNode.barWidth, orderNode.barHeight, ratio);
            }

            // 畫完進度條後，立即通知 HUD 更新數字
            EventBus.emit('hud:order_tick', { 
                id: orderNode.name.replace('order_', ''), 
                timeLeft: orderNode.timeLeft 
            });
        });
    },

    _onOrderRemoved(data) {
        if (!this.node) return;
        const orderNode = this.node.getChildByName('order_' + data.id);
        if (orderNode) {
            cc.log('[OrderUIHandler] 移除訂單 UI，ID:', data.id);
            orderNode.removeFromParent(); 
            orderNode.destroy();

            const layout = this.node.getComponent(cc.Layout);
            if (layout) {
                layout.updateLayout();
            }
        }
    },

    // ── 🎨 核心繪圖邏輯（灰色底、綠色隨時間由右向左減少） ──
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