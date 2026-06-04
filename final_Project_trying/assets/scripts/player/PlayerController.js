/**
 * PlayerController  (cc.Component)
 *
 * ── 移動（velocity-based，自由行走）───────────────────────
 *  SPEED = 150 px/s，對角線 ÷√2
 *  AABB 分軸碰撞：先解 X，再解 Y（沿牆滑動）
 *  碰撞對象：GridSystem blocked 格子 + 地板邊界
 *
 * ── 互動 ────────────────────────────────────────────────
 *  按 INTERACT → 以當前世界座標算出格子 → 朝向前方格子查 Station
 *
 * ── 網路同步（20 Hz）─────────────────────────────────────
 *  emit 'player:moved'：{ playerId, x, y, facing }
 *  遠端呼叫 applyNetworkState(x, y, facingName)
 */

const GridSystem      = require('../core/GridSystem');
const EventBus        = require('../core/EventBus');
const GameManager     = require('../core/GameManager');
const InputHandler    = require('../input/InputHandler');
const BoarController  = require('./BoarController');

const SPEED             = 150;
const PLAYER_HALF_W     = 20;
const PLAYER_HALF_H     = 14;
const NET_SEND_INTERVAL = 0.05;   // 20 Hz
const INV_SQRT2         = 0.70710678;

const CarryState = {
    EMPTY:   'empty',
    HOLDING: 'holding',
};

const Direction = {
    UP:         { dc:  0, dr: -1, name: 'up'         },
    DOWN:       { dc:  0, dr:  1, name: 'down'       },
    LEFT:       { dc: -1, dr:  0, name: 'left'       },
    RIGHT:      { dc:  1, dr:  0, name: 'right'      },
    UP_RIGHT:   { dc:  1, dr: -1, name: 'up_right'   },
    UP_LEFT:    { dc: -1, dr: -1, name: 'up_left'    },
    DOWN_RIGHT: { dc:  1, dr:  1, name: 'down_right' },
    DOWN_LEFT:  { dc: -1, dr:  1, name: 'down_left'  },
};

const PlayerController = cc.Class({
    extends: cc.Component,

    statics: { CarryState, Direction },

    properties: {
        playerId: {
            default: 1,
            type: cc.Integer,
        },
        startCol: { default: 5, type: cc.Integer },
        startRow: { default: 4, type: cc.Integer },
        boarPrefab: {
            default: null,
            type: cc.Prefab,
        },
    },

    onLoad() {
        const pos    = GridSystem.toWorld(this.startCol, this.startRow);
        this._px     = pos.x;
        this._py     = pos.y;
        this._vx     = 0;
        this._vy     = 0;
        this._isMoving   = false;
        this._facing     = Direction.DOWN;
        this._carryState = CarryState.EMPTY;
        this._heldItem   = null;
        this._netTimer   = 0;

        // 技能冷卻計時（秒）
        this._skillCooldowns = { skill_1: 0, skill_2: 0 };

        const b = GridSystem.floorBounds();
        this._floorTop    = b.top;
        this._floorBottom = b.bottom;

        this.node.x = this._px;
        this.node.y = this._py;

        if (GameManager.instance) {
            GameManager.instance.registerPlayer(this.playerId, this);
        }

        // 監聽遠端技能事件（只有本地玩家的 Controller 才執行）
        EventBus.on('skill:remote', this._onRemoteSkill, this);
    },

    onDestroy() {
        EventBus.off('skill:remote', this._onRemoteSkill, this);
    },

    update(dt) {
        // 多人模式：只有本地玩家接受鍵盤
        if (window._nmRole) {
            const localId = window._nmRole === 'host' ? 1 : 2;
            if (this.playerId !== localId) return;
        }

        const input = InputHandler.instance;
        if (!input) return;

        const A  = InputHandler.Action;
        const id = 1;

        const up    = input.isHeld(id, A.MOVE_UP);
        const down  = input.isHeld(id, A.MOVE_DOWN);
        const left  = input.isHeld(id, A.MOVE_LEFT);
        const right = input.isHeld(id, A.MOVE_RIGHT);

        let vx = 0, vy = 0;
        if (left)  vx -= 1;
        if (right) vx += 1;
        if (up)    vy += 1;
        if (down)  vy -= 1;

        if (vx !== 0 && vy !== 0) {
            vx *= INV_SQRT2;
            vy *= INV_SQRT2;
        }

        this._vx = vx * SPEED;
        this._vy = vy * SPEED;
        this._isMoving = (this._vx !== 0 || this._vy !== 0);

        // 更新朝向（對角優先，再判斷單方向）
        if      (up   && right) this._facing = Direction.UP_RIGHT;
        else if (up   && left)  this._facing = Direction.UP_LEFT;
        else if (down && right) this._facing = Direction.DOWN_RIGHT;
        else if (down && left)  this._facing = Direction.DOWN_LEFT;
        else if (up)            this._facing = Direction.UP;
        else if (down)          this._facing = Direction.DOWN;
        else if (left)          this._facing = Direction.LEFT;
        else if (right)         this._facing = Direction.RIGHT;

        this._moveWithCollision(dt);

        // 更新所有技能冷卻
        for (const key in this._skillCooldowns) {
            if (this._skillCooldowns[key] > 0) this._skillCooldowns[key] -= dt;
        }

        if (input.isJustPressed(id, A.INTERACT)) {
            this._tryInteract();
        }

        if (input.isJustPressed(id, A.SKILL)) {
            cc.log('[Skill] E 鍵偵測到，呼叫 _useSkill');
            this._useSkill();
        }

        // 網路同步
        this._netTimer += dt;
        if (this._netTimer >= NET_SEND_INTERVAL) {
            this._netTimer = 0;
            EventBus.emit('player:moved', {
                playerId: this.playerId,
                x:        this._px,
                y:        this._py,
                facing:   this._facing.name,
            });
        }
    },

    // ── 移動與碰撞 ────────────────────────────────────────

    _moveWithCollision(dt) {
        const blocked = GridSystem.getBlockedCells();

        // X 軸
        let nx = this._px + this._vx * dt;
        const xb = GridSystem.getFloorXBoundsAtWorldY(this._py);
        nx = Math.max(xb.left + PLAYER_HALF_W, Math.min(xb.right - PLAYER_HALF_W, nx));
        nx = this._resolveAxisX(blocked, nx, this._py);
        this._px = nx;

        // Y 軸
        let ny = this._py + this._vy * dt;
        ny = Math.max(this._floorBottom + PLAYER_HALF_H, Math.min(this._floorTop - PLAYER_HALF_H, ny));
        ny = this._resolveAxisY(blocked, this._px, ny);
        this._py = ny;

        this.node.x = this._px;
        this.node.y = this._py;
    },

    _resolveAxisX(blocked, nx, py) {
        for (const { col, row } of blocked) {
            const b = GridSystem.getCellBounds(col, row);
            if (py - PLAYER_HALF_H >= b.top)    continue;
            if (py + PLAYER_HALF_H <= b.bottom) continue;
            if (nx + PLAYER_HALF_W <= b.left)   continue;
            if (nx - PLAYER_HALF_W >= b.right)  continue;
            nx = (this._px <= b.cx) ? b.left - PLAYER_HALF_W : b.right + PLAYER_HALF_W;
        }
        return nx;
    },

    _resolveAxisY(blocked, px, ny) {
        for (const { col, row } of blocked) {
            const b = GridSystem.getCellBounds(col, row);
            if (px - PLAYER_HALF_W >= b.right)  continue;
            if (px + PLAYER_HALF_W <= b.left)   continue;
            if (ny + PLAYER_HALF_H <= b.bottom) continue;
            if (ny - PLAYER_HALF_H >= b.top)    continue;
            ny = (this._py <= b.cy) ? b.bottom - PLAYER_HALF_H : b.top + PLAYER_HALF_H;
        }
        return ny;
    },

    // ── 技能 ──────────────────────────────────────────────

    _useSkill() {
        const skill = window._selectedSkill || 'skill_1';
        if (this._skillCooldowns[skill] > 0) {
            cc.log(`[Skill] ${skill} 冷卻中，剩餘 ${this._skillCooldowns[skill].toFixed(1)}s`);
            return;
        }
        if (skill === 'skill_1') {
            this._skillCooldowns.skill_1 = 0;   // 熊貓暫無冷卻
            this._spawnBoar();
        } else if (skill === 'skill_2') {
            this._skillCooldowns.skill_2 = 20;
            this._useRefreshOrder();
        }
    },

    _useRefreshOrder() {
        // 本地觸發（只有 Host 的 OrderManager 會真正執行）
        EventBus.emit('order:refresh');
        // 廣播給對方
        EventBus.emit('skill:local', { skill: 'skill_2' });
        cc.log('[Skill] 二退：觸發訂單刷新');
    },

    _spawnBoar() {
        if (!this.boarPrefab) {
            cc.warn('[Skill] boarPrefab 未設定');
            return;
        }

        const SPAWN_DIST = 50;
        const f = this._facing;
        const spawnX = this._px + f.dc * SPAWN_DIST;
        const spawnY = this._py + (-f.dr) * SPAWN_DIST;

        // 產生 seed，兩端用相同 seed 確保走法一致
        const seed = Math.floor(Math.random() * 0xffffffff);
        this._spawnBoarAt(spawnX, spawnY, seed);

        // 廣播給對方（含 seed）
        EventBus.emit('skill:local', { skill: 'skill_1', x: spawnX, y: spawnY, seed });
    },

    _spawnBoarAt(x, y, seed) {
        if (!this.boarPrefab) return;
        const canvas = cc.find('Canvas');
        if (!canvas) return;
        const boar = cc.instantiate(this.boarPrefab);
        if (seed !== undefined) boar._boarSeed = seed;
        boar.parent = canvas;
        boar.x = x;
        boar.y = y;
    },

    _onRemoteSkill(data) {
        // 只有本地玩家的 Controller 才執行，避免雙重觸發
        if (window._nmRole) {
            const localId = window._nmRole === 'host' ? 1 : 2;
            if (this.playerId !== localId) return;
        }
        if (data.skill === 'skill_1') {
            this._spawnBoarAt(data.x, data.y, data.seed);
        } else if (data.skill === 'skill_2') {
            // 觸發本地 OrderManager（Host 才會真正執行，Guest 等 EV_ORDER）
            EventBus.emit('order:refresh');
        }
    },

    // ── 互動 ──────────────────────────────────────────────

    _tryInteract() {
        const { col, row } = GridSystem.toGrid(this._px, this._py);
        const targetCol = col + this._facing.dc;
        const targetRow = row + this._facing.dr;
        if (!GameManager.instance) return;
        const station = GameManager.instance.getStation(targetCol, targetRow);
        if (station) station.onInteract(this);
    },

    // ── 持有 API ──────────────────────────────────────────

    pickUp(itemNode) {
        if (this._carryState === CarryState.HOLDING) return;
        this._heldItem   = itemNode;
        this._carryState = CarryState.HOLDING;
        itemNode.parent  = this.node;
        itemNode.x       = 0;
        itemNode.y       = GridSystem.CELL_H * 0.6;
        EventBus.emit('player:pickup', { playerId: this.playerId, item: itemNode.name });
    },

    dropItem() {
        if (this._carryState === CarryState.EMPTY) return null;
        const item       = this._heldItem;
        this._heldItem   = null;
        this._carryState = CarryState.EMPTY;
        EventBus.emit('player:drop', { playerId: this.playerId, item: item ? item.name : null });
        return item;
    },

    // ── 網路同步（遠端玩家）──────────────────────────────

    applyNetworkState(x, y, facingName) {
        for (const key in Direction) {
            if (Direction[key].name === facingName) {
                this._facing = Direction[key];
                break;
            }
        }
        cc.tween(this.node)
            .to(0.08, { x, y })
            .call(() => { this._px = this.node.x; this._py = this.node.y; })
            .start();
    },

    // ── Getter（用一般方法，避免 cc.Class getter 報錯）───

    facing()        { return this._facing;        },
    movementState() { return this._isMoving ? 'moving' : 'idle'; },
    carryState()    { return this._carryState;    },
    heldItem()      { return this._heldItem;      },
    isMoving()      { return this._isMoving;      },
    isCarrying()    { return this._carryState === CarryState.HOLDING; },
});

module.exports = PlayerController;
