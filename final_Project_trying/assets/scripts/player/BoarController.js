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

        this.node.x = nx;
        this.node.y = ny;

        this._pushPlayers();
        this._updateSprite();
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
        const d = dirs[Math.floor(Math.random() * dirs.length)];
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
        return DIR_CHANGE_MIN + Math.random() * (DIR_CHANGE_MAX - DIR_CHANGE_MIN);
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
