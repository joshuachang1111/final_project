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
 *   TABLE          一般桌台：暫放食材 / 半成品
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
const ItemSprites = require('./ItemSpriteRegistry');

/** 所有站台類型 */
const StationType = {
    FOOD_BOX:      'FOOD_BOX',
    CUTTING_BOARD: 'CUTTING_BOARD',
    STOVE:         'STOVE',
    SERVING:       'SERVING',
    TRASH:         'TRASH',
    TABLE:         'TABLE',
};

const BURGER_PARTS = {
    bread:              ['bread'],
    tomato_sliced:      ['tomato'],
    onion_sliced:       ['onion'],
    meat:               ['meat'],
    bread_meat:         ['bread', 'meat'],
    bread_onion:        ['bread', 'onion'],
    bread_tomato:       ['bread', 'tomato'],
    bread_meat_onion:   ['bread', 'meat', 'onion'],
    bread_meat_tomato:  ['bread', 'meat', 'tomato'],
    bread_tomato_onion: ['bread', 'tomato', 'onion'],
    hamburger:          ['bread', 'meat', 'onion', 'tomato'],
};

const BURGER_RESULT_BY_KEY = {
    'bread,meat':              'bread_meat',
    'bread,onion':             'bread_onion',
    'bread,tomato':            'bread_tomato',
    'bread,meat,onion':        'bread_meat_onion',
    'bread,meat,tomato':       'bread_meat_tomato',
    'bread,onion,tomato':      'bread_tomato_onion',
    'bread,meat,onion,tomato': 'hamburger',
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
            tooltip: 'FOOD_BOX / CUTTING_BOARD / STOVE / SERVING / TRASH / TABLE',
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
        /** 只調整工作台圖片大小，不影響格子碰撞與互動位置 */
        visualScale: {
            default: 1.45,
            tooltip: '工作台圖片顯示倍率；碰撞仍固定為一格',
        },
        /** 物品放在工作台上時，相對於拿在手上的大小倍率 */
        itemScale: {
            default: 0.65,
            tooltip: '放在工作台上的物品大小；相對於手持大小，並會抵消工作台本身 visualScale',
        },
        /** 物品放在工作台上時的位置微調 */
        itemOffsetY: {
            default: 12,
            tooltip: '放在工作台上的物品往上偏移量',
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
        this.node.width  = GridSystem.getCellWidthAtRow(this.gridRow);
        this.node.height = GridSystem.CELL_H;
        this.node.scale  = this.visualScale;

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
        if (this._heldItem) {
            if (this.stationType === StationType.TABLE) {
                this._tryAssembleOnTable(player);
            }
            return;
        }

        const item     = player.dropItem();
        this._heldItem = item;

        if (item) {
            item.parent = this.node;
            item.x      = 0;
            item.y      = this.itemOffsetY;
            this._setItemDisplayOnStation(item);
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

    _setItemDisplayOnStation(item) {
        const baseScale = this.node.scale || 1;
        const safeScale = baseScale === 0 ? 1 : baseScale;
        const carryScale = (typeof item._carryScale === 'number') ? item._carryScale : 1;
        item.scale = carryScale * this.itemScale / safeScale;
    },

    _tryAssembleOnTable(player) {
        if (!player || !player.isCarrying || !player.isCarrying()) return;

        const handItem = player.heldItem ? player.heldItem() : null;
        if (!handItem) return;

        const result = this._getAssemblyResult(this._heldItem.name, handItem.name);
        if (!result) {
            cc.log('[Table] 不能組裝:', this._heldItem.name, '+', handItem.name);
            return;
        }

        const consumed = player.dropItem();
        if (consumed) consumed.destroy();

        this._setHeldItemResult(result);

        cc.log('[Table] 組裝完成:', result);
        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        result,
        });
    },

    _getAssemblyResult(tableItemName, handItemName) {
        const tableItem = this._normalizeItemName(tableItemName);
        const handItem  = this._normalizeItemName(handItemName);

        if (tableItem === 'black_tea' || handItem === 'black_tea') return null;

        if (
            (tableItem === 'toast' && handItem === 'chocolate_jam') ||
            (tableItem === 'chocolate_jam' && handItem === 'toast')
        ) {
            return 'chocolate_toast';
        }

        return this._getBurgerAssemblyResult(tableItem, handItem);
    },

    _getBurgerAssemblyResult(a, b) {
        const aParts = BURGER_PARTS[a];
        const bParts = BURGER_PARTS[b];
        if (!aParts || !bParts) return null;

        const merged = [];
        aParts.concat(bParts).forEach(part => {
            if (merged.indexOf(part) === -1) merged.push(part);
        });

        if (merged.length !== aParts.length + bParts.length) return null;
        if (merged.indexOf('bread') === -1) return null;

        const order = ['bread', 'meat', 'onion', 'tomato'];
        const key = order.filter(part => merged.indexOf(part) !== -1).join(',');
        return BURGER_RESULT_BY_KEY[key] || null;
    },

    _normalizeItemName(itemName) {
        return String(itemName || '').replace(/^noncooked_/, '');
    },

    _setHeldItemResult(resultName) {
        this._heldItem.name = resultName;
        this._setItemSpriteFrame(this._heldItem, resultName);
    },

    _setItemSpriteFrame(item, itemName) {
        ItemSprites.applySpriteFrame(item, itemName);
    },

    get heldItem()  { return this._heldItem;         },
    hasItem()       { return this._heldItem !== null; },
});

module.exports = StationBase;
