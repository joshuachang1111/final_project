/**
 * PlayerController  (cc.Component)
 * 掛在每個玩家的節點上。
 *
 * ── 狀態機 ─────────────────────────────────────────────
 *
 *  移動狀態 (MovementState)
 *   IDLE    → 接受輸入，可以移動或互動
 *   MOVING  → tween 執行中，忽略所有輸入
 *
 *  持有狀態 (CarryState)
 *   EMPTY   → 雙手空著
 *   HOLDING → 拿著一個 item node
 *
 *  兩個狀態獨立，組合出：
 *   IDLE + EMPTY    → 可移動、可拾取
 *   IDLE + HOLDING  → 可移動、可放下 / 遞交
 *   MOVING + *      → 不能做任何事，等 tween 結束
 *
 * ── 朝向 (Facing) ──────────────────────────────────────
 *  UP / DOWN / LEFT / RIGHT
 *  按下移動鍵時立即更新朝向，並嘗試移動。
 *  互動時以當前朝向的前方格子為目標。
 *
 * ── 互動流程 ───────────────────────────────────────────
 *  1. 玩家按下 INTERACT
 *  2. 計算朝向前方的格子 (targetCol, targetRow)
 *  3. 向 GameManager 查詢該格子是否有 StationBase
 *  4. 有 → 呼叫 station.onInteract(this)，由 station 決定行為
 *  5. 沒有 → 無事發生
 */

const GridSystem   = require('../core/GridSystem');
const EventBus     = require('../core/EventBus');
const GameManager  = require('../core/GameManager');
const InputHandler = require('../input/InputHandler');

// ── 常數 ─────────────────────────────────────────────────

const MovementState = {
    IDLE:   'idle',
    MOVING: 'moving',
};

const CarryState = {
    EMPTY:   'empty',
    HOLDING: 'holding',
};

/** 四個方向的格子偏移 */
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
        MovementState,
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
        /** 每格移動耗時（秒） */
        moveTime: {
            default: 0.12,
            tooltip: '越小越快，建議 0.10 ~ 0.18',
        },
        /** 初始格子位置 */
        startCol: { default: 1, type: cc.Integer },
        startRow: { default: 4, type: cc.Integer },
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        this._col           = this.startCol;
        this._row           = this.startRow;
        this._facing        = Direction.DOWN;
        this._movementState = MovementState.IDLE;
        this._carryState    = CarryState.EMPTY;
        this._heldItem      = null;   // 拿著的 cc.Node

        // 對齊到起始格子
        const pos = GridSystem.toWorld(this._col, this._row);
        this.node.x = pos.x;
        this.node.y = pos.y;

        // 向 GameManager 登記自己
        if (GameManager.instance) {
            GameManager.instance.registerPlayer(this.playerId, this);
        }
    },

    // ─────────────────────────────────────────────
    //  主迴圈
    // ─────────────────────────────────────────────

    update() {
        // 多人模式：只有本地玩家才接受鍵盤輸入
        if (window._nmRole) {
            const localId = window._nmRole === 'host' ? 1 : 2;
            if (this.playerId !== localId) return;
        }

        // tween 執行中，不接受任何輸入
        if (this._movementState === MovementState.MOVING) return;

        const input = InputHandler.instance;
        if (!input) {
            cc.log('P' + this.playerId + ': InputHandler 不存在');
            return;
        }

        const A  = InputHandler.Action;
        const id = 1; // 統一使用 WASD（binding 1）

        // ── 移動輸入（held） ──────────────────────────
        // 優先順序：上 > 下 > 左 > 右（同時按只處理第一個）
        let dir = null;
        if      (input.isHeld(id, A.MOVE_UP))    dir = Direction.UP;
        else if (input.isHeld(id, A.MOVE_DOWN))  dir = Direction.DOWN;
        else if (input.isHeld(id, A.MOVE_LEFT))  dir = Direction.LEFT;
        else if (input.isHeld(id, A.MOVE_RIGHT)) dir = Direction.RIGHT;

        if (dir) {
            this._facing = dir;   // 按鍵時立即更新朝向
            this._tryMove(this._col + dir.dc, this._row + dir.dr);
        }

        // ── 互動輸入（just pressed） ──────────────────
        if (input.isJustPressed(id, A.INTERACT)) {
            this._tryInteract();
        }
    },

    // ─────────────────────────────────────────────
    //  移動
    // ─────────────────────────────────────────────

    _tryMove(targetCol, targetRow) {
        if (!GridSystem.isWalkable(targetCol, targetRow)) return;

        this._movementState = MovementState.MOVING;
        this._col = targetCol;
        this._row = targetRow;

        const pos = GridSystem.toWorld(targetCol, targetRow);

        cc.tween(this.node)
            .to(this.moveTime, { x: pos.x, y: pos.y }, { easing: 'quadOut' })
            .call(() => {
                this._movementState = MovementState.IDLE;
            })
            .start();

        EventBus.emit('player:moved', {
            playerId: this.playerId,
            col:      this._col,
            row:      this._row,
            facing:   this._facing.name,
        });
    },

    // ─────────────────────────────────────────────
    //  互動
    // ─────────────────────────────────────────────

    _tryInteract() {
        const targetCol = this._col + this._facing.dc;
        const targetRow = this._row + this._facing.dr;

        const station = GameManager.instance
            ? GameManager.instance.getStation(targetCol, targetRow)
            : null;

        if (station) {
            station.onInteract(this);
        }
    },

    // ─────────────────────────────────────────────
    //  持有 API（由 StationBase 呼叫）
    // ─────────────────────────────────────────────

    /**
     * 從站台拿起 item node
     * @param {cc.Node} itemNode
     */
    pickUp(itemNode) {
        if (this._carryState === CarryState.HOLDING) return;

        this._heldItem   = itemNode;
        this._carryState = CarryState.HOLDING;

        // 將 item 節點掛到玩家節點下方，顯示在頭上
        itemNode.parent = this.node;
        itemNode.x = 0;
        itemNode.y = GridSystem.CELL_H * 0.6;   // 懸浮在頭頂：約 34px

        EventBus.emit('player:pickup', {
            playerId: this.playerId,
            item:     itemNode.name,
        });
    },

    /**
     * 將持有的 item node 還給呼叫者
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

    applyNetworkState(col, row, facingName) {
        this._col = col;
        this._row = row;
        for (const key in Direction) {
            if (Direction[key].name === facingName) {
                this._facing = Direction[key];
                break;
            }
        }
        const pos = GridSystem.toWorld(col, row);
        cc.tween(this.node)
            .to(0.1, { x: pos.x, y: pos.y })
            .start();
    },

    // ─────────────────────────────────────────────
    //  Getter
    // ─────────────────────────────────────────────

    get col()           { return this._col;           },
    get row()           { return this._row;           },
    get facing()        { return this._facing;        },
    get movementState() { return this._movementState; },
    get carryState()    { return this._carryState;    },
    get heldItem()      { return this._heldItem;      },
    isCarrying()        { return this._carryState === CarryState.HOLDING; },
});

module.exports = PlayerController;
