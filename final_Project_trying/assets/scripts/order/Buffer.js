const EventBus = require('../core/EventBus');

cc.Class({
    extends: cc.Component,

    properties: {
        // 將你的 black_tea, hamburger, chocolate_toast 拖入這裡
        // 確保它們在編輯器裡的 SpriteFrame 名稱與我們邏輯中的 key 一致
        foodSprites: {
            default: [],
            type: [cc.SpriteFrame]
        }
    },

    onLoad() {
        EventBus.on('buffer:update', this._onBufferUpdate, this);
        EventBus.on('buffer:clear', this._onBufferClear, this);
        // 訂單系統有時候會走「sub-order 過期」/ 訂單取消 / refresh 等路徑，
        // 那些地方不一定每條都 emit buffer:clear。掛上 order 端的事件，當任何
        // 訂單被移除時，也順便把 buffer 清掉（保險）。
        EventBus.on('order:completed', this._onBufferClear, this);
        EventBus.on('order:expired', this._onBufferClear, this);
        // 場景進入時保險清一次
        this._forceHide();
    },

    onDestroy() {
        EventBus.off('buffer:update', this._onBufferUpdate, this);
        EventBus.off('buffer:clear', this._onBufferClear, this);
        EventBus.off('order:completed', this._onBufferClear, this);
        EventBus.off('order:expired', this._onBufferClear, this);
    },

    _forceHide() {
        if (!this.node) return;
        this.node.removeAllChildren();
        this.node.opacity = 0;
        this.node.active = false;
    },

    _onBufferUpdate(data) {
        // 邊界：items 為空 → 視同 clear，避免空 buffer 殘留
        if (!data || !data.items || data.items.length === 0) {
            this._forceHide();
            return;
        }
        this.node.removeAllChildren();
        this.node.opacity = 255;
        this.node.active = true;

        

        cc.log('[BufferingUI] 渲染總數:', data.items.length);

        // 如果你的 Layout 元件設為 NONE，我們手動計算坐標
        const startX = -100; // 起始 X 座標 (相對於 Buffer 節點中央)
        const spacingX = 60; // 每個 icon 的間距

        data.items.forEach((itemName, index) => {
            const frame = this.foodSprites.find(f => f.name === itemName);
            
            if (frame) {
                const iconNode = new cc.Node('Icon_' + itemName);
                const sprite = iconNode.addComponent(cc.Sprite);
                sprite.spriteFrame = frame;
                
                // --- 終極坐標與渲染修正 ---
                sprite.sizeMode = cc.Sprite.SizeMode.RAW; 
                iconNode.setContentSize(cc.size(80, 80)); 

                // 手動計算排列座標，強制水平排列
                iconNode.setPosition(startX + index * spacingX, 0); 
                // ------------------------

                // --- 【新增】調整縮放 ---
                iconNode.scale = 0.08; // 數值越小圖片越小
                // -----------------------
                
                iconNode.parent = this.node;
                
                cc.log('[BufferingUI] 已建立節點並設定坐標:', iconNode.getPosition());
            }
        });
    },

    _onBufferClear() {
        cc.log('[BufferingUI] 收到清空指令');
        this._forceHide();
    }
});