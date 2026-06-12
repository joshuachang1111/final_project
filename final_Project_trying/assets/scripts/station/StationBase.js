const GridSystem  = require('../core/GridSystem');
const EventBus    = require('../core/EventBus');
const GameManager = require('../core/GameManager');
const ItemSprites = require('./ItemSpriteRegistry');

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
        // 全域站台查找表（key = "col,row"），供無 GameManager 場景（burger_battle）使用
        _registry: null,
    },

    properties: {
        stationType: {
            default: 'STOVE',
            tooltip: 'FOOD_BOX / CUTTING_BOARD / STOVE / SERVING / TRASH / TABLE',
        },
        gridCol: {
            default: 0,
            type: cc.Integer,
        },
        gridRow: {
            default: 0,
            type: cc.Integer,
        },
        visualScale: {
            default: 1.45,
            tooltip: 'Station visual scale; collision stays grid based',
        },
        itemScale: {
            default: 0.65,
            tooltip: 'Scale for items displayed on this station',
        },
        itemOffsetY: {
            default: 12,
            tooltip: 'Y offset for items displayed on this station',
        },
    },

    onLoad() {
        const pos = GridSystem.toWorld(this.gridCol, this.gridRow);
        this.node.x      = pos.x;
        this.node.y      = pos.y;
        this.node.width  = GridSystem.getCellWidthAtRow(this.gridRow);
        this.node.height = GridSystem.CELL_H;
        this.node.scale  = this.visualScale;

        GridSystem.setBlocked(this.gridCol, this.gridRow, true);

        // 加入全域 registry（burger_battle 等無 GameManager 場景使用）
        if (!StationBase._registry) StationBase._registry = new Map();
        StationBase._registry.set(`${this.gridCol},${this.gridRow}`, this);

        if (GameManager.instance) {
            GameManager.instance.registerStation(this.gridCol, this.gridRow, this);
        }

        this._heldItem = null;
    },

    onDestroy() {
        if (StationBase._registry) StationBase._registry.delete(`${this.gridCol},${this.gridRow}`);
        GridSystem.setBlocked(this.gridCol, this.gridRow, false);
    },

    onInteract(player) {
        if (player.isCarrying()) {
            this._onPlace(player);
        } else {
            this._onPickup(player);
        }
    },

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

    _onPlace(player) {
        if (this._heldItem) {
            if (this.stationType === StationType.TABLE) {
                this._tryAssembleOnTable(player);
            }
            return;
        }

        const item = player.dropItem();
        this._heldItem = item;

        if (item) {
            item.parent = this.node;
            item.x = 0;
            item.y = this.itemOffsetY;
            this._setItemDisplayOnStation(item);
        }

        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        item ? item.name : null,
        });
    },

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
            cc.log('[Table] Cannot assemble:', this._heldItem.name, '+', handItem.name);
            return;
        }

        const consumed = player.dropItem();
        if (consumed) consumed.destroy();

        this._setHeldItemResult(result);

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
