/**
 * PlayerController  (cc.Component)
 * 掛在每個玩家的節點上。
 *
 * ── 移動系統（velocity-based，自由行走）──────────────────
 *
 *  玩家在世界座標 (x, y) 中連續移動，不鎖格。
 *  SPEED = 120 px/s，對角線時除以 √2（維持速度恆定）。
 *  碰撞採 AABB + 分軸解算（先解 X，再解 Y），支援沿牆滑動。
 *  碰撞對象：GridSystem.setBlocked(true) 的格子 + 地板邊界。
 *
 * ── 朝向 (Facing) ──────────────────────────────────────
 *  UP / DOWN / LEFT / RIGHT
 *  以最後一個「主要按鍵」決定，對角線時以垂直鍵優先。
 *
 * ── 互動流程 ───────────────────────────────────────────
 *  1. 玩家按下 INTERACT
 *  2. 由當前 world 座標算出所在格子 (col, row)
 *  3. 在朝向的前方格子查詢 StationBase
 *  4. 有 → 呼叫 station.onInteract(this)
 *
 * ── 持有狀態 (CarryState) ──────────────────────────────
 *  EMPTY   → 雙手空著
 *  HOLDING → 拿著一個 item node（顯示在頭頂）
 *
 * ── 網路同步（20 Hz）─────────────────────────────────
 *  每 NET_SEND_INTERVAL 秒 emit 一次 'player:moved'
 *  payload: { playerId, x, y, facing }
 *  遠端玩家收到後呼叫 applyNetworkState(x, y, facingName)
 */

const GridSystem   = require('../core/GridSystem');
const EventBus     = require('../core/EventBus');
const GameManager  = require('../core/GameManager');
const InputHandler = require('../input/InputHandler');

// ── 移動常數 ────────────────────────────────────────────

const SPEED             = 120;    // px/s
const PLAYER_HALF_W     = 19;     // 碰撞半寬（大約 CELL_W * 0.3）
const PLAYER_HALF_H     = 17;     // 碰撞半高（大約 CELL_H * 0.3）
const NET_SEND_INTERVAL = 0.05;   // 20 Hz 網路同步

const INV_SQRT2 = 0.70710678;

// ── 狀態 ────────────────────────────────────────────────

const CarryState = {
    EMPTY:   'empty',
    HOLDING: 'holding',
};

/** 四個方向的格子偏移（互動用） */
const Direction = {
    UP:    { dc:  0, dr: -1, name: 'up'    },
    DOWN:  { dc:  0, dr:  1, name: 'down'  },
    LEFT:  { dc: -1, dr:  0, name: 'left'  },
    RIGHT: { dc:  1, dr:  0, name: 'right' },
};

// ─────────────────────────────────────────────────────────

const PlayerController = cc.Class({
    extends: cc.Component,

    statics: {
        CarryState,
        Direction,
    },

    properties: {
        /** 1 = WASD + F，2 = 方向鍵 + Space */
        playerId: {
            default: 1,
            type: cc.Integer,
            tooltip: '1 或 2，對應 InputHandler 的按鍵配置',
        },
        /** 初始格子位置（用格子座標，onLoad 會轉成世界座標） */
        startCol: { default: 1, type: cc.Integer },
        startRow: { default: 4, type: cc.Integer },
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        // 世界座標（連續值）
        const pos = GridSystem.toWorld(this.startCol, this.startRow);
        this._px = pos.x;
        this._py = pos.y;

        // 速度
        this._vx = 0;
        this._vy = 0;

        // 狀態
        this._facing     = Direction.DOWN;
        this._carryState = CarryState.EMPTY;
        this._heldItem   = null;

        // 網路計時
        this._netTimer = 0;

        // 地板邊界（快取，避免每幀重算）
        const b = GridSystem.floorBounds();
        this._floorLeft   = b.left;
        this._floorRight  = b.right;
        this._floorTop    = b.top;
        this._floorBottom = b.bottom;

        // 設定初始位置
        this.node.x = this._px;
        this.node.y = this._py;

        // 向 GameManager 登記
        if (GameManager.instance) {
            GameManager.instance.registerPlayer(this.playerId, this);
        }
    },

    // ─────────────────────────────────────────────
    //  主迴圈
    // ─────────────────────────────────────────────

    update(dt) {
        // 多人模式：只有本地玩家才接受鍵盤輸入
        if (window._nmRole) {
            const localId = window._nmRole === 'host' ? 1 : 2;
            if (this.playerId !== localId) return;
        }

        const input = InputHandler.instance;
        if (!input) return;

        const A  = InputHandler.Action;
        const id = 1;   // 統一使用 binding 1（WASD）

        // ── 收集方向輸入 ─────────────────────────────
        const up    = input.isHeld(id, A.MOVE_UP);
        const down  = input.isHeld(id, A.MOVE_DOWN);
        const left  = input.isHeld(id, A.MOVE_LEFT);
        const right = input.isHeld(id, A.MOVE_RIGHT);

        let vx = 0;
        let vy = 0;
        if (left)  vx -= 1;
        if (right) vx += 1;
        if (up)    vy += 1;
        if (down)  vy -= 1;

        // 對角線速度正規化（維持恆速 120 px/s）
        if (vx !== 0 && vy !== 0) {
            vx *= INV_SQRT2;
            vy *= INV_SQRT2;
        }

        this._vx = vx * SPEED;
        this._vy = vy * SPEED;

        // 更新朝向（垂直優先）
        if      (up)    this._facing = Direction.UP;
        else if (down)  this._facing = Direction.DOWN;
        else if (left)  this._facing = Direction.LEFT;
        else if (right) this._facing = Direction.RIGHT;

        // ── 移動 + 碰撞 ──────────────────────────────
        this._moveWithCollision(dt);

        // ── 互動 ─────────────────────────────────────
        if (input.isJustPressed(id, A.INTERACT)) {
            this._tryInteract();
        }

        // ── 網路同步 ─────────────────────────────────
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

    // ─────────────────────────────────────────────
    //  移動與碰撞
    // ─────────────────────────────────────────────

    _moveWithCollision(dt) {
        const blocked = GridSystem.getBlockedCells();

        // ── X 軸移動 ─────────────────────────────────
        let nx = this._px + this._vx * dt;
        // 地板邊界
        nx = Math.max(this._floorLeft  + PLAYER_HALF_W,
             Math.min(this._floorRight - PLAYER_HALF_W, nx));
        // 站台碰撞
        nx = this._resolveAxisX(blocked, nx, this._py);
        this._px = nx;

        // ── Y 軸移動 ─────────────────────────────────
        let ny = this._py + this._vy * dt;
        // 地板邊界
        ny = Math.max(this._floorBottom + PLAYER_HALF_H,
             Math.min(this._floorTop    - PLAYER_HALF_H, ny));
        // 站台碰撞
        ny = this._resolveAxisY(blocked, this._px, ny);
        this._py = ny;

        this.node.x = this._px;
        this.node.y = this._py;
    },

    /**
     * 解算 X 軸碰撞：固定 Y 為 py，嘗試將 X 移到 nx。
     * 若與任何站台 AABB 重疊，將 nx 推到格子邊界外。
     */
    _resolveAxisX(blocked, nx, py) {
        for (const { col, row } of blocked) {
            const c = GridSystem.toWorld(col, row);
            const cellL = c.x - GridSystem.CELL_W / 2;
            const cellR = c.x + GridSystem.CELL_W / 2;
            const cellB = c.y - GridSystem.CELL_H / 2;
            const cellT = c.y + GridSystem.CELL_H / 2;

            // 在 Y 方向是否有重疊？
            if (py - PLAYER_HALF_H >= cellT) continue;
            if (py + PLAYER_HALF_H <= cellB) continue;

            // 在 X 方向是否重疊？
            if (nx + PLAYER_HALF_W <= cellL) continue;
            if (nx - PLAYER_HALF_W >= cellR) continue;

            // 依據玩家相對格子中心的位置決定推出方向
            if (this._px <= c.x) {
                nx = cellL - PLAYER_HALF_W;   // 推到格子左邊
            } else {
                nx = cellR + PLAYER_HALF_W;   // 推到格子右邊
            }
        }
        return nx;
    },

    /**
     * 解算 Y 軸碰撞：固定 X 為 px（已解算後的值），嘗試將 Y 移到 ny。
     */
    _resolveAxisY(blocked, px, ny) {
        for (const { col, row } of blocked) {
            const c = GridSystem.toWorld(col, row);
            const cellL = c.x - GridSystem.CELL_W / 2;
            const cellR = c.x + GridSystem.CELL_W / 2;
            const cellB = c.y - GridSystem.CELL_H / 2;
            const cellT = c.y + GridSystem.CELL_H / 2;

            // 在 X 方向是否有重疊？
            if (px - PLAYER_HALF_W >= cellR) continue;
            if (px + PLAYER_HALF_W <= cellL) continue;

            // 在 Y 方向是否重疊？
            if (ny + PLAYER_HALF_H <= cellB) continue;
            if (ny - PLAYER_HALF_H >= cellT) continue;

            // 依據玩家相對格子中心的位置決定推出方向
            if (this._py <= c.y) {
                ny = cellB - PLAYER_HALF_H;   // 推到格子下方
            } else {
                ny = cellT + PLAYER_HALF_H;   // 推到格子上方
            }
        }
        return ny;
    },

    // ─────────────────────────────────────────────
    //  互動
    // ─────────────────────────────────────────────

    _tryInteract() {
        const { col, row } = GridSystem.toGrid(this._px, this._py);
        const targetCol = col + this._facing.dc;
        const targetRow = row + this._facing.dr;

        if (!GameManager.instance) return;
        const station = GameManager.instance.getStation(targetCol, targetRow);
        if (station) {
            station.onInteract(this);
        }
    },

    // ─────────────────────────────────────────────
    //  持有 API（由 StationBase 呼叫）
    // ─────────────────────────────────────────────

    /**
     * 從站台拿起 item node，顯示在頭上。
     * @param {cc.Node} itemNode
     */
    pickUp(itemNode) {
        if (this._carryState === CarryState.HOLDING) return;

        this._heldItem   = itemNode;
        this._carryState = CarryState.HOLDING;

        itemNode.parent = this.node;
        itemNode.x = 0;
        itemNode.y = GridSystem.CELL_H * 0.6;   // 懸浮在頭頂 ≈ 34 px

        EventBus.emit('player:pickup', {
            playerId: this.playerId,
            item:     itemNode.name,
        });
    },

    /**
     * 將持有的 item node 還給呼叫者。
     * @returns {cc.Node|null}
     */
    dropItem() {
        if (this._carryState === CarryState.EMPTY) return null;

        const item       = this._heldItem;
        this._heldItem   = null;
        this._carryState = CarryState.EMPTY;

        EventBus.emit('player:drop', {
            playerId: this.playerId,
            item:     item ? item.name : null,
        });

        return item;
    },

    // ─────────────────────────────────────────────
    //  網路同步（遠端玩家）
    // ─────────────────────────────────────────────

    /**
     * 收到遠端玩家位置更新時呼叫。
     * @param {number} x     世界座標 X
     * @param {number} y     世界座標 Y
     * @param {string} facingName  'up' | 'down' | 'left' | 'right'
     */
    applyNetworkState(x, y, facingName) {
        for (const key in Direction) {
            if (Direction[key].name === facingName) {
                this._facing = Direction[key];
                break;
            }
        }
        cc.tween(this.node)
            .to(0.08, { x, y })
            .call(() => {
                this._px = this.node.x;
                this._py = this.node.y;
            })
            .start();
    },

    // ─────────────────────────────────────────────
    //  Getter
    // ─────────────────────────────────────────────

    /** 動態由世界座標算出目前所在格子欄 */
    get col()     { return GridSystem.toGrid(this._px, this._py).col; },
    /** 動態由世界座標算出目前所在格子列 */
    get row()     { return GridSystem.toGrid(this._px, this._py).row; },
    get facing()  { return this._facing; },
    /** true 代表目前有速度（動畫控制器用） */
    get isMoving() { return this._vx !== 0 || this._vy !== 0; },
    /** 向後相容（AnimationController 可改用 isMoving） */
    get movementState() { return this.isMoving ? 'moving' : 'idle'; },
    get carryState()    { return this._carryState; },
    get heldItem()      { return this._heldItem; },
    isCarrying()        { return this._carryState === CarryState.HOLDING; },
});

module.exports = PlayerController;
