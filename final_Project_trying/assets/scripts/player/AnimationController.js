const FRAME_SIZE = 80;
const FRAME_COLS = 4;
const FRAME_ROWS = 4;

const DIR_TO_ROW = {
    down:  0,
    up:    1,
    left:  2,
    right: 3,
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
        this._player    = null;
        this._frameIdx  = 0;
        this._frameTime = 0;
        // Bug 6 fix: SpriteFrame cache — built once in start(), indexed [row][col]
        this._frames    = null;
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

        // Bug 6 fix: pre-build all FRAME_ROWS × FRAME_COLS SpriteFrames once
        this._frames = [];
        for (let row = 0; row < FRAME_ROWS; row++) {
            this._frames[row] = [];
            for (let col = 0; col < FRAME_COLS; col++) {
                this._frames[row][col] = new cc.SpriteFrame(
                    texture,
                    new cc.Rect(col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE)
                );
            }
        }

        this._showFrame(0, 0);
    },

    update(dt) {
        if (!this._player || !this._frames) return;

        const isMoving = this._player.isMoving;
        const row      = DIR_TO_ROW[this._player.facing && this._player.facing.name] ?? 0;

        if (isMoving) {
            this._frameTime += dt;
            if (this._frameTime >= 1 / this.fps) {
                this._frameTime = 0;
                this._frameIdx  = (this._frameIdx + 1) % FRAME_COLS;
            }
        } else {
            this._frameIdx  = 0;
            this._frameTime = 0;
        }

        this._showFrame(row, this._frameIdx);
    },

    // Bug 6 fix: just assign from cache — no object allocation
    _showFrame(row, col) {
        this._sprite.spriteFrame = this._frames[row][col];
    },
});

module.exports = AnimationController;
