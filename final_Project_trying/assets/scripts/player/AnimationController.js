/**
 * AnimationController  (cc.Component)
 * 掛在玩家節點上，與 PlayerController 同節點。
 *
 * ── Sprite Sheet 格式 ────────────────────────────────────
 *   4 欄 × 4 列，每格 80×80 px，全圖 320×320 px
 *
 *   row 0：往下走（4 幀）← 預設朝向
 *   row 1：往上走（4 幀）
 *   row 2：往左走（4 幀）
 *   row 3：往右走（4 幀）
 *
 * ── 運作方式 ─────────────────────────────────────────────
 *   每幀讀取同節點 PlayerController 的朝向與移動狀態，
 *   計算要顯示哪一 row（方向）和哪一 col（動畫幀），
 *   然後更新 Sprite 的 SpriteFrame。
 *
 *   靜止時固定顯示 col=0（站立姿勢）。
 *   移動中以 fps 速率循環播放 0~3 幀。
 */

const FRAME_SIZE = 80;
const COLS       = 4;

const DIR_TO_ROW = {
    down:  0,   // 第一排
    up:    1,   // 第二排
    left:  2,   // 第三排
    right: 3,   // 第四排
};

const PlayerController = require('./PlayerController');

const AnimationController = cc.Class({
    extends: cc.Component,

    properties: {
        fps: {
            default: 8,
            tooltip: '移動動畫速率（幀/秒），建議 6~10',
        },
    },

    onLoad() {
        this._sprite    = this.node.getComponent(cc.Sprite);
        this._texture   = null;
        this._player    = null;
        this._frameIdx  = 0;
        this._frameTime = 0;
    },

    start() {
        // 在 start() 取 PlayerController，確保所有 onLoad 都跑完了
        this._player = this.node.getComponent(PlayerController);
        if (!this._player) {
            cc.error('[AnimationController] 找不到 PlayerController，請確認兩個組件在同一節點上');
            return;
        }

        if (this._sprite && this._sprite.spriteFrame) {
            this._texture = this._sprite.spriteFrame.getTexture();
        }
        if (!this._texture) {
            cc.error('[AnimationController] 找不到 Texture，請確認 Sprite Frame 已設定');
            return;
        }

        this._showFrame(0, 0);   // 預設：面向下，站立（row 0 = down）
    },

    update(dt) {
        if (!this._player || !this._texture) return;

        const isMoving = this._player.movementState === 'moving';
        const row      = DIR_TO_ROW[this._player.facing.name] ?? 0;

        if (isMoving) {
            this._frameTime += dt;
            if (this._frameTime >= 1 / this.fps) {
                this._frameTime = 0;
                this._frameIdx  = (this._frameIdx + 1) % COLS;
            }
        } else {
            this._frameIdx  = 0;
            this._frameTime = 0;
        }

        this._showFrame(row, this._frameIdx);
    },

    _showFrame(row, col) {
        const sf = new cc.SpriteFrame(
            this._texture,
            new cc.Rect(col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE)
        );
        this._sprite.spriteFrame = sf;
    },
});

module.exports = AnimationController;
