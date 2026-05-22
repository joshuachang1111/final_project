/**
 * StationBase  (cc.Component)
 * 所有互動站台的基礎類別，掛在每個站台節點上。
 *
 * ── 站台類型 ────────────────────────────────────────────
 *   FOOD_BOX       食材箱：提供無限食材（每次互動產生新 item）
 *   CUTTING_BOARD  砧板  ：放上食材後開始切割倒數
 *   STOVE          火爐  ：放上食材後開始烹飪倒數
 *   SERVING        出餐口：接受完成品，完成訂單
 *   TRASH          垃圾桶：丟棄任何食材 / 食物
 *
 * ── 互動邏輯 ────────────────────────────────────────────
 *   玩家 EMPTY    → 嘗試從站台拿取 (_onPickup)
 *   玩家 HOLDING  → 嘗試放置到站台 (_onPlace)
 *
 *   子類別可以 override onInteract() 來實作更細緻的行為，
 *   也可以 override _onPickup() / _onPlace() 只改局部邏輯。
 *
 * ── 如何擴展 ────────────────────────────────────────────
 *   const StationBase = require('../station/StationBase');
 *
 *   const Stove = cc.Class({
 *       extends: StationBase,
 *       onInteract(player) {
 *           // 自訂邏輯，或呼叫 this._super(player) 走預設流程
 *       },
 *   });
 */

const GridSystem  = require('../core/GridSystem');
const EventBus    = require('../core/EventBus');
const GameManager = require('../core/GameManager');

/** 所有站台類型 */
const StationType = {
    FOOD_BOX:      'FOOD_BOX',
    CUTTING_BOARD: 'CUTTING_BOARD',
    STOVE:         'STOVE',
    SERVING:       'SERVING',
    TRASH:         'TRASH',
};

const StationBase = cc.Class({
    extends: cc.Component,

    statics: {
        StationType,
    },

    properties: {
        /** 在 Inspector 中選擇站台類型 */
        stationType: {
            default: 'STOVE',
            tooltip: 'FOOD_BOX / CUTTING_BOARD / STOVE / SERVING / TRASH',
        },
        /** 對應格子欄位 */
        gridCol: {
            default: 0,
            type: cc.Integer,
        },
        /** 對應格子列位 */
        gridRow: {
            default: 0,
            type: cc.Integer,
        },
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        // 對齊到格子中心
        const pos = GridSystem.toWorld(this.gridCol, this.gridRow);
        this.node.x      = pos.x;
        this.node.y      = pos.y;
        this.node.width  = GridSystem.CELL_W;
        this.node.height = GridSystem.CELL_H;

        // 登記為不可通行
        GridSystem.setBlocked(this.gridCol, this.gridRow, true);

        // 向 GameManager 登記，供 PlayerController 查找
        if (GameManager.instance) {
            GameManager.instance.registerStation(this.gridCol, this.gridRow, this);
        }

        this._heldItem = null;   // 目前放在此站台上的 item（cc.Node）
    },

    onDestroy() {
        GridSystem.setBlocked(this.gridCol, this.gridRow, false);
    },

    // ─────────────────────────────────────────────
    //  互動入口（子類別可 override）
    // ─────────────────────────────────────────────

    /**
     * 玩家按下 INTERACT 且朝向本站台時呼叫。
     * 預設行為：HOLDING → 放置，EMPTY → 拿取。
     * @param {PlayerController} player
     */
    onInteract(player) {
        if (player.isCarrying()) {
            this._onPlace(player);
        } else {
            this._onPickup(player);
        }
    },

    // ─────────────────────────────────────────────
    //  預設放置 / 拿取（子類別可 override）
    // ─────────────────────────────────────────────

    /**
     * 玩家（空手）嘗試從本站台拿取物品。
     * 子類別可 override 加入食材箱無限產生等特殊邏輯。
     */
    _onPickup(player) {
        if (!this._heldItem) return;

        player.pickUp(this._heldItem);
        this._heldItem = null;

        EventBus.emit('station:pickup', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
        });
    },

    /**
     * 玩家（持有物品）嘗試將物品放到本站台。
     * 子類別可 override 加入垃圾桶直接銷毀、出餐口完成訂單等邏輯。
     */
    _onPlace(player) {
        if (this._heldItem) return;   // 站台已有物品，不能再放

        const item     = player.dropItem();
        this._heldItem = item;

        if (item) {
            item.parent = this.node;
            item.x      = 0;
            item.y      = 0;
        }

        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        item ? item.name : null,
        });
    },

    // ─────────────────────────────────────────────
    //  Getter
    // ─────────────────────────────────────────────

    get heldItem()  { return this._heldItem;         },
    hasItem()       { return this._heldItem !== null; },
});

module.exports = StationBase;
