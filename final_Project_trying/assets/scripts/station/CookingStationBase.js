const StationBase = require('./StationBase');
const EventBus    = require('../core/EventBus');

const COOK_RESULTS = {
    STOVE: {
        raw_meat: 'meat',
    },
    CUTTING_BOARD: {
        tomato: 'tomato_sliced',
        onion:  'onion_sliced',
    },
};

const CookingStationBase = cc.Class({
    extends: StationBase,

    properties: {
        cookTime: {
            default: 5,
            type: cc.Integer,
            tooltip: 'Seconds needed to process this ingredient',
        },
    },

    onLoad() {
        this._super();
        this._cooking     = false;
        this._isDone      = false;
        this._cookResult  = null;
        this._cookEndTime = 0;
        this._timerLabel  = null;
    },

    onDestroy() {
        this.unscheduleAllCallbacks();
        this._super();
    },

    _onPlace(player) {
        if (this._cooking || this._isDone || this._heldItem) {
            cc.log('[CookingStation] Station is busy.');
            return;
        }

        const item = player.dropItem();
        this._heldItem = item;

        if (item) {
            item.parent = this.node;
            item.x = this.itemOffsetX;
            item.y = this.itemOffsetY;
            this._setItemDisplayOnStation(item);
        }

        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        item ? item.name : null,
        });

        this._cookResult = item ? this._getCookResult(item.name) : null;
        if (!this._cookResult) {
            cc.log('[CookingStation] Item cannot be processed here:', item ? item.name : null);
            return;
        }

        this._cooking = true;
        this._cookEndTime = this._nowSeconds() + this.cookTime;
        this._showTimerLabel(this.cookTime);
        this.schedule(this._updateTimerLabel, 0.1);
        this.scheduleOnce(this._onCookDone, this.cookTime);
    },

    _onPickup(player) {
        if (this._cooking) {
            cc.log('[CookingStation] Still processing.');
            return;
        }

        if (!this._heldItem) {
            cc.log('[CookingStation] Nothing to pick up.');
            return;
        }

        player.pickUp(this._heldItem);
        this._heldItem = null;
        this._isDone = false;
        this._cookResult = null;
        this._hideTimerLabel();

        EventBus.emit('station:pickup', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
        });
    },

    _onCookDone() {
        this.unschedule(this._updateTimerLabel);
        this._hideTimerLabel();

        if (!this._heldItem || !this._cookResult) {
            this._cooking = false;
            return;
        }

        this._heldItem.name = this._cookResult;
        this._setItemSpriteFrame(this._heldItem, this._heldItem.name);

        this._cooking = false;
        this._isDone  = true;

        EventBus.emit('station:cook_done', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            result:      this._heldItem.name,
        });
    },

    _getCookResult(itemName) {
        const stationRecipes = COOK_RESULTS[this.stationType];
        if (!stationRecipes) return null;

        const normalizedName = String(itemName || '').replace(/^noncooked_/, '');
        return stationRecipes[normalizedName] || null;
    },

    _nowSeconds() {
        if (cc.director && cc.director.getTotalTime) {
            return cc.director.getTotalTime() / 1000;
        }
        return Date.now() / 1000;
    },

    _ensureTimerLabel() {
        if (this._timerLabel && cc.isValid(this._timerLabel.node)) return this._timerLabel;

        const labelNode = new cc.Node('CookTimerLabel');
        labelNode.parent = this.node;
        labelNode.x = this.itemOffsetX;
        labelNode.y = this.itemOffsetY + 45;
        labelNode.scale = 1 / (this.node.scale || 1);

        const label = labelNode.addComponent(cc.Label);
        label.fontSize = 22;
        label.lineHeight = 24;
        label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        label.verticalAlign = cc.Label.VerticalAlign.CENTER;
        label.string = '';

        this._timerLabel = label;
        return label;
    },

    _showTimerLabel(secondsLeft) {
        const label = this._ensureTimerLabel();
        label.node.active = true;
        label.string = String(Math.max(1, Math.ceil(secondsLeft)));
    },

    _updateTimerLabel() {
        if (!this._cooking) return;

        const secondsLeft = this._cookEndTime - this._nowSeconds();
        this._showTimerLabel(secondsLeft);
    },

    _hideTimerLabel() {
        this.unschedule(this._updateTimerLabel);
        if (this._timerLabel && cc.isValid(this._timerLabel.node)) {
            this._timerLabel.node.active = false;
        }
    },
});

module.exports = CookingStationBase;
