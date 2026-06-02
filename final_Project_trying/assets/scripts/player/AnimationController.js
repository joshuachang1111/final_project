/**
 * AnimationController  (cc.Component)
 * 搭配 8 方向靜態 Sprite Sheet 使用。
 *
 * Sprite Sheet 格式：
 *   256 × 2048 px（1 欄 × 8 列，每格 256×256）
 *   row 0 = down
 *   row 1 = down_right
 *   row 2 = right
 *   row 3 = up_right
 *   row 4 = up
 *   row 5 = up_left
 *   row 6 = left
 *   row 7 = down_left
 *
 * 功能：
 *  1. 依 facing 切換朝向 Sprite Frame（8 方向）
 *  2. 移動中做 Y 軸彈跳縮放（走路感）
 */

const FRAME_W  = 256;   // 每格寬度（px）
const FRAME_H  = 256;   // 每格高度（px）
const NUM_DIRS = 8;     // 方向數

// 彈跳動畫參數
const BOUNCE_SCALE  = 1.10;   // 彈跳時的最大 Y 縮放
const BOUNCE_HALF   = 0.12;   // 每半個週期的秒數（總週期 0.24s）

const DIR_TO_ROW = {
    down:       0,
    down_right: 1,
    right:      2,
    up_right:   3,
    up:         4,
    up_left:    5,
    left:       6,
    down_left:  7,
};

const PlayerController = require('./PlayerController');

const AnimationController = cc.Class({
    extends: cc.Component,

    onLoad() {
        this._sprite      = this.node.getComponent(cc.Sprite);
        this._player      = null;
        this._frames      = null;
        this._lastRow     = -1;
        this._loadedChar  = null;   // 目前已載入的角色 ID，避免重複載入

        // 彈跳計時
        this._bounceTimer = 0;
        this._bounceUp    = true;
    },

    start() {
        this._player = this.node.getComponent(PlayerController);
        if (!this._player) {
            cc.error('[AnimationController] 找不到 PlayerController');
            return;
        }

        const localId = window._nmRole === 'host' ? 1 : (window._nmRole === 'guest' ? 2 : this._player.playerId);
        const isLocal = (this._player.playerId === localId) || !window._nmRole;

        cc.log(`[AnimCtrl] playerId=${this._player.playerId} localId=${localId} isLocal=${isLocal} role=${window._nmRole} sprite=${!!this._sprite}`);

        if (isLocal) {
            const charId = window._selectedCharacter || null;
            cc.log(`[AnimCtrl] 本地 → charId=${charId}`);
            if (charId) { this.loadCharacter(charId); } else { this._initFromSprite(); }
        } else {
            const remoteChar = window._remoteCharacter || null;
            cc.log(`[AnimCtrl] 遠端 → remoteChar=${remoteChar}`);
            if (remoteChar) { this.loadCharacter(remoteChar); } else { this._initFromSprite(); }
        }
    },

    // 公開方法：隨時可呼叫來切換角色 sprite
    loadCharacter(charId) {
        if (!charId) return;
        if (this._loadedChar === charId) return;   // 已載入，跳過
        this._loadedChar = charId;
        cc.log(`[AnimCtrl] loadCharacter: ${charId}, sprite=${!!this._sprite}`);
        cc.resources.load(`characters/${charId}_sheet`, cc.Texture2D, (err, tex) => {
            if (err || !tex) {
                cc.warn('[AnimCtrl] 載入失敗:', charId, err && err.message);
                this._loadedChar = null;   // 重置，下次再試
                this._initFromSprite();
                return;
            }
            cc.log(`[AnimCtrl] 載入成功: ${charId}`);
            this._buildFrames(tex);
        });
    },

    _initFromSprite() {
        const texture = this._sprite && this._sprite.spriteFrame
            ? this._sprite.spriteFrame.getTexture()
            : null;
        if (!texture) {
            cc.error('[AnimationController] 找不到 Texture，請確認 Sprite Frame 已設定');
            return;
        }
        this._buildFrames(texture);
    },

    _buildFrames(texture) {
        // 預建 8 個方向的 SpriteFrame（每個方向佔一列）
        this._frames = [];
        for (let row = 0; row < NUM_DIRS; row++) {
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
