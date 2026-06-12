/**
 * BurgerServingCounter  (cc.Component)
 * 漢堡對抗模式的送餐台。
 *
 * 玩家拿著 "hamburger" 朝向此站台按 F → 送出 → +150 分。
 * 自行注冊到 StationBase._registry，讓 PlayerController._tryInteract() 能找到。
 * 視覺使用遊戲原版 serving counter sprite（UUID 載入）。
 *
 * 由 BurgerBattleManager.onLoad() 程式化建立。
 */

const GridSystem   = require('../core/GridSystem');
const StationBase  = require('./StationBase');

// station_serving_counter sprite UUID（img/level1/工作臺/station_serving_counter.png subMeta）
const SERVING_SPRITE_UUID = '85cb1bb9-75a6-4ba1-9684-014d33706372';

const BurgerServingCounter = cc.Class({
    extends: cc.Component,

    statics: { instances: [] },

    properties: {
        ownerId:  { default: 1, type: cc.Integer },
        gridCol:  { default: 4, type: cc.Integer },
        gridRow:  { default: 3, type: cc.Integer },
    },

    onLoad() {
        BurgerServingCounter.instances.push(this);

        // 注冊到 StationBase._registry，讓 _tryInteract() 能找到
        if (!StationBase._registry) StationBase._registry = new Map();
        StationBase._registry.set(`${this.gridCol},${this.gridRow}`, this);

        // 阻擋格子
        GridSystem.setBlocked(this.gridCol, this.gridRow, true);

        // 定位
        const pos = GridSystem.toWorld(this.gridCol, this.gridRow);
        this.node.setPosition(pos.x, pos.y);
        this.node.width  = GridSystem.getCellWidthAtRow(this.gridRow);
        this.node.height = GridSystem.CELL_H;
        this.node.zIndex = 3;

        this._loadSprite();

        // P 標示（送餐台標記）
        this._addLabel();
    },

    onDestroy() {
        const idx = BurgerServingCounter.instances.indexOf(this);
        if (idx >= 0) BurgerServingCounter.instances.splice(idx, 1);

        if (StationBase._registry) StationBase._registry.delete(`${this.gridCol},${this.gridRow}`);
        GridSystem.setBlocked(this.gridCol, this.gridRow, false);
    },

    // ── 互動（由 _tryInteract 呼叫）──────────────────────────

    onInteract(player) {
        if (!player.isCarrying()) return;

        const item = player.heldItem ? player.heldItem() : null;
        if (!item) return;

        if (item.name !== 'hamburger') {
            cc.log(`[BurgerServing] P${player.playerId} 放的不是漢堡（${item.name}），退回`);
            return;
        }

        // 送出漢堡
        const delivered = player.dropItem();
        if (delivered && cc.isValid(delivered)) delivered.destroy();

        const BBM = require('../ui/BurgerBattleManager');
        if (BBM && BBM.instance) {
            BBM.instance.addScore(player.playerId, 150);
        }
        cc.log(`[BurgerServing] P${player.playerId} 送出漢堡！+150 分`);
    },

    // ── 視覺 ─────────────────────────────────────────────────

    _loadSprite() {
        const sp = this.node.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        cc.assetManager.loadAny({ uuid: SERVING_SPRITE_UUID }, (err, asset) => {
            if (err || !cc.isValid(this.node)) {
                this._drawFallback();
                return;
            }
            if (asset instanceof cc.SpriteFrame) {
                sp.spriteFrame = asset;
            } else {
                this._drawFallback();
            }
        });
    },

    _drawFallback() {
        const gfxNode = new cc.Node('FallbackBG');
        const gfx     = gfxNode.addComponent(cc.Graphics);
        gfx.fillColor   = cc.color(200, 90, 30, 220);
        const hw = this.node.width / 2;
        const hh = this.node.height / 2;
        gfx.rect(-hw, -hh, this.node.width, this.node.height);
        gfx.fill();
        this.node.addChild(gfxNode);
    },

    _addLabel() {
        // 不顯示文字標示
    },
});

module.exports = BurgerServingCounter;
