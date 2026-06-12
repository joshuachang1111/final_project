/**
 * BoarController
 * 召喚技能產生的野豬 AI：
 *  - 速度 225 px/s（玩家 150 * 1.5）
 *  - 在可走地板範圍內隨機換方向（每 1.0～2.0 秒）
 *  - 碰到地板邊界立刻反向
 *  - 碰到玩家 AABB 重疊時把玩家推開
 *  - 10 秒後自動銷毀
 */

const GridSystem  = require('../core/GridSystem');
const GameManager = require('../core/GameManager');

// ── 種子亂數（LCG）─────────────────────────────────────────
// 相同 seed 產生相同序列，確保兩端熊貓走法一致
function makeRNG(seed) {
    let s = (seed >>> 0) || 1;
    return function() {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const BOAR_SPEED     = 195;   // 玩家 150 * 1.3
const BOAR_HALF_W    = 35;
const BOAR_HALF_H    = 25;
const BOAR_LIFETIME  = 10;
const DIR_CHANGE_MIN = 1.0;
const DIR_CHANGE_MAX = 2.0;
const PUSH_IMPULSE   = 300;

const FRAME_W  = 256;
const FRAME_H  = 256;
const NUM_DIRS = 8;

const DIR_TO_ROW = {
    down: 0, down_right: 1, right: 2, up_right: 3,
    up: 4, up_left: 5, left: 6, down_left: 7,
};

const INV_SQRT2 = 0.70710678;

const BoarController = cc.Class({
    extends: cc.Component,

    onLoad() {
        // 使用 node._boarSeed（由 _spawnBoarAt 設定），沒有則隨機產生
        const seed = this.node._boarSeed !== undefined
            ? this.node._boarSeed
            : Math.floor(Math.random() * 0xffffffff);
        this._rng = makeRNG(seed);

        this._dirTimer    = 0;
        this._dirCooldown = this._nextCooldown();
        this._vx = 0;
        this._vy = 0;
        this._dirName = 'down';
        this._frames  = null;
        // 優先在子節點 'Sprite' 找，找不到才用根節點
        const spriteNode = this.node.getChildByName('Sprite') || this.node;
        this._sprite = spriteNode.getComponent(cc.Sprite);


        const b = GridSystem.floorBounds();
        this._floorTop    = b.top;
        this._floorBottom = b.bottom;

        this._pickRandomDir();
        this._loadSprite();

        this.scheduleOnce(() => {
            if (cc.isValid(this.node)) this.node.destroy();
        }, BOAR_LIFETIME);
    },

    update(dt) {
        this._dirTimer += dt;
        if (this._dirTimer >= this._dirCooldown) {
            this._dirTimer    = 0;
            this._dirCooldown = this._nextCooldown();
            this._pickRandomDir();
        }

        let nx = this.node.x + this._vx * dt;
        let ny = this.node.y + this._vy * dt;

        // ── 地板邊界 ────────────────────────────────────────
        const xb = GridSystem.getFloorXBoundsAtWorldY(this.node.y);
        if (nx - BOAR_HALF_W < xb.left) {
            nx = xb.left + BOAR_HALF_W;
            this._vx = Math.abs(this._vx);
            this._syncDirName();
        } else if (nx + BOAR_HALF_W > xb.right) {
            nx = xb.right - BOAR_HALF_W;
            this._vx = -Math.abs(this._vx);
            this._syncDirName();
        }

        if (ny - BOAR_HALF_H < this._floorBottom) {
            ny = this._floorBottom + BOAR_HALF_H;
            this._vy = Math.abs(this._vy);
            this._syncDirName();
        } else if (ny + BOAR_HALF_H > this._floorTop) {
            ny = this._floorTop - BOAR_HALF_H;
            this._vy = -Math.abs(this._vy);
            this._syncDirName();
        }

        // ── Station 碰撞（與 PlayerController 相同的分軸解算）──
        const blocked = GridSystem.getBlockedCells();
        nx = this._resolveBoarX(blocked, nx, ny);
        ny = this._resolveBoarY(blocked, nx, ny);

        this.node.x = nx;
        this.node.y = ny;

        this._pushPlayers();
        this._updateSprite();
    },

    // ── Station 碰撞解算（分軸，碰到後彈回）───────────────

    _resolveBoarX(blocked, nx, ny) {
        for (const { col, row } of blocked) {
            const b = GridSystem.getCellBounds(col, row);
            // Y 方向無重疊 → 跳過
            if (ny - BOAR_HALF_H >= b.top)    continue;
            if (ny + BOAR_HALF_H <= b.bottom) continue;
            // X 方向無重疊 → 跳過
            if (nx + BOAR_HALF_W <= b.left)   continue;
            if (nx - BOAR_HALF_W >= b.right)  continue;
            // 碰撞：從哪邊進來就推出去，並反轉 X 速度（彈開）
            if (this.node.x <= b.cx) {
                nx = b.left  - BOAR_HALF_W;
                this._vx = -Math.abs(this._vx);
            } else {
                nx = b.right + BOAR_HALF_W;
                this._vx =  Math.abs(this._vx);
            }
            this._syncDirName();
        }
        return nx;
    },

    _resolveBoarY(blocked, nx, ny) {
        for (const { col, row } of blocked) {
            const b = GridSystem.getCellBounds(col, row);
            // X 方向無重疊 → 跳過
            if (nx - BOAR_HALF_W >= b.right)  continue;
            if (nx + BOAR_HALF_W <= b.left)   continue;
            // Y 方向無重疊 → 跳過
            if (ny + BOAR_HALF_H <= b.bottom) continue;
            if (ny - BOAR_HALF_H >= b.top)    continue;
            // 碰撞：反轉 Y 速度（彈開）
            if (this.node.y <= b.cy) {
                ny = b.bottom - BOAR_HALF_H;
                this._vy = -Math.abs(this._vy);
            } else {
                ny = b.top    + BOAR_HALF_H;
                this._vy =  Math.abs(this._vy);
            }
            this._syncDirName();
        }
        return ny;
    },

    _pushPlayers() {
        if (!GameManager.instance) return;
        const players = GameManager.instance.getAllPlayers
            ? GameManager.instance.getAllPlayers()
            : [];

        for (const player of players) {
            if (!player || !cc.isValid(player.node)) continue;
            const dx = player._px - this.node.x;
            const dy = player._py - this.node.y;
            if (Math.abs(dx) < BOAR_HALF_W + 22 && Math.abs(dy) < BOAR_HALF_H + 16) {
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                player._px += (dx / dist) * PUSH_IMPULSE * 0.016;
                player._py += (dy / dist) * PUSH_IMPULSE * 0.016;
                player.node.x = player._px;
                player.node.y = player._py;
            }
        }
    },

    _pickRandomDir() {
        const dirs = [
            { vx:  0,                      vy:  BOAR_SPEED,           name: 'up'         },
            { vx:  0,                      vy: -BOAR_SPEED,           name: 'down'       },
            { vx: -BOAR_SPEED,             vy:  0,                    name: 'left'       },
            { vx:  BOAR_SPEED,             vy:  0,                    name: 'right'      },
            { vx:  BOAR_SPEED * INV_SQRT2, vy:  BOAR_SPEED * INV_SQRT2, name: 'up_right'   },
            { vx: -BOAR_SPEED * INV_SQRT2, vy:  BOAR_SPEED * INV_SQRT2, name: 'up_left'    },
            { vx:  BOAR_SPEED * INV_SQRT2, vy: -BOAR_SPEED * INV_SQRT2, name: 'down_right' },
            { vx: -BOAR_SPEED * INV_SQRT2, vy: -BOAR_SPEED * INV_SQRT2, name: 'down_left'  },
        ];
        const d = dirs[Math.floor(this._rng() * dirs.length)];
        this._vx = d.vx;
        this._vy = d.vy;
        this._dirName = d.name;
    },

    _syncDirName() {
        const ax = Math.abs(this._vx), ay = Math.abs(this._vy);
        const isX = ax > ay * 1.5, isY = ay > ax * 1.5;
        if (isX)      this._dirName = this._vx > 0 ? 'right' : 'left';
        else if (isY) this._dirName = this._vy > 0 ? 'up'    : 'down';
        else {
            const hx = this._vx > 0 ? 'right' : 'left';
            const hy = this._vy > 0 ? 'up'    : 'down';
            this._dirName = `${hy}_${hx}`;
        }
    },

    _nextCooldown() {
        return DIR_CHANGE_MIN + this._rng() * (DIR_CHANGE_MAX - DIR_CHANGE_MIN);
    },

    _loadSprite() {
        cc.resources.load('boar_sheet', cc.Texture2D, (err, tex) => {
            if (err || !tex || !cc.isValid(this.node)) return;
            if (this._sprite) this._sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            this._frames = [];
            for (let row = 0; row < NUM_DIRS; row++) {
                this._frames[row] = new cc.SpriteFrame(
                    tex, new cc.Rect(0, row * FRAME_H, FRAME_W, FRAME_H)
                );
            }
            this._updateSprite();
        });
    },

    _updateSprite() {
        if (!this._sprite || !this._frames) return;
        const row = DIR_TO_ROW[this._dirName] ?? 0;
        this._sprite.spriteFrame = this._frames[row];
    },

    statics: {
        spawn(parentNode, x, y) {
            const node = new cc.Node('Boar');
            node.setAnchorPoint(0.5, 0.5);
            node.setContentSize(256, 256);
            node.setScale(0.45);
            const sp = node.addComponent(cc.Sprite);
            sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            node.addComponent(BoarController);
            node.parent = parentNode;
            node.x = x;
            node.y = y;
            return node;
        },
    },
});

module.exports = BoarController;
