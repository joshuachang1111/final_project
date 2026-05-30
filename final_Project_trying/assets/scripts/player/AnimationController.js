/**
 * AnimationController  (cc.Component)
 * 搭配 4 方向靜態 Sprite Sheet 使用。
 *
 * Sprite Sheet 格式：
 *   256 × 1024 px（1 欄 × 4 列，每格 256×256）
 *   row 0 = down
 *   row 1 = up
 *   row 2 = left
 *   row 3 = right
 *
 * 功能：
 *  1. 依 facing 切換朝向 Sprite Frame
 *  2. 移動中做 Y 軸彈跳縮放（走路感）
 */

const FRAME_W = 256;   // 每格寬度（px）
const FRAME_H = 256;   // 每格高度（px）

// 彈跳動畫參數
const BOUNCE_SCALE  = 1.10;   // 彈跳時的最大 Y 縮放
const BOUNCE_HALF   = 0.12;   // 每半個週期的秒數（總週期 0.24s）

const DIR_TO_ROW = {
    down:  0,
    up:    1,
    left:  3,   // 渲染時 left/right 互換，對調修正
    right: 2,
};

const PlayerController = require('./PlayerController');

const AnimationController = cc.Class({
    extends: cc.Component,

    onLoad() {
        this._sprite      = this.node.getComponent(cc.Sprite);
        this._player      = null;
        this._frames      = null;
        this._lastRow     = -1;

        // 彈跳計時
        this._bounceTimer = 0;
        this._bounceUp    = true;   // 目前彈跳方向（true=往上縮放）
    },

    start() {
        this._player = this.node.getComponent(PlayerController);
        if (!this._player) {
            cc.error('[AnimationController] 找不到 PlayerController');
            return;
        }

        const texture = this._sprite && this._sprite.spriteFrame
            ? this._sprite.spriteFrame.getTexture()
            : null;

        if (!texture) {
            cc.error('[AnimationController] 找不到 Texture，請確認 Sprite Frame 已設定');
            return;
        }

        // 預建 4 個方向的 SpriteFrame（每個方向佔一列）
        this._frames = [];
        for (let row = 0; row < 4; row++) {
            this._frames[row] = new cc.SpriteFrame(
                texture,
                new cc.Rect(0, row * FRAME_H, FRAME_W, FRAME_H)
            );
        }

        this._showRow(0);
    },

    update(dt) {
        if (!this._player || !this._frames) return;

        // ── 1. 切換方向 Sprite ──────────────────────────
        const f   = this._player.facing();
        const row = DIR_TO_ROW[f && f.name] ?? 0;
        if (row !== this._lastRow) {
            this._showRow(row);
            this._lastRow = row;
        }

        // ── 2. 彈跳縮放動畫 ──────────────────────────────
        const isMoving = this._player.movementState() === 'moving';

        if (isMoving) {
            this._bounceTimer += dt;
            if (this._bounceTimer >= BOUNCE_HALF) {
                this._bounceTimer = 0;
                this._bounceUp    = !this._bounceUp;
            }
            // 線性插值：0→BOUNCE_SCALE 或 BOUNCE_SCALE→1
            const t   = this._bounceTimer / BOUNCE_HALF;
            const scY = this._bounceUp
                ? 1.0 + (BOUNCE_SCALE - 1.0) * t
                : BOUNCE_SCALE - (BOUNCE_SCALE - 1.0) * t;
            this.node.scaleY = scY;
        } else {
            // 閒置時，平滑回到 1.0
            this.node.scaleY += (1.0 - this.node.scaleY) * 0.2;
            this._bounceTimer = 0;
            this._bounceUp    = true;
        }
    },

    _showRow(row) {
        if (this._sprite && this._frames[row]) {
            this._sprite.spriteFrame = this._frames[row];
        }
    },
});

module.exports = AnimationController;
