const StationBase = require('./StationBase');
const EventBus = require('../core/EventBus');

const CHECK_RESULTS = {
    iPhone: {
        checked: 'iPhone_checked',
        broken: 'iPhone_broken',
    },
    Airpods: {
        checked: 'Airpods_checked',
        broken: 'Airpods_broken',
    },
    charger: {
        checked: 'charger_checked',
        broken: 'charger_broken',
    },
};

const CheckStation = cc.Class({
    extends: StationBase,

    properties: {
        checkTime: {
            default: 4,
            type: cc.Integer,
            tooltip: 'Seconds needed to check a level2 item',
        },
        brokenChance: {
            default: 0.1,
            tooltip: 'Chance that a checked item becomes broken',
        },
    },

    onLoad() {
        this._super();
        this._checking = false;
        this._isDone = false;
        this._checkEndTime = 0;
        this._timerLabel = null;
    },

    onDestroy() {
        this.unscheduleAllCallbacks();
        this._super();
    },

    _onPlace(player) {
        if (this._checking || this._isDone || this._heldItem) {
            cc.log('[CheckStation] Station is busy.');
            return;
        }

        const item = player.dropItem();
        if (!item) return;

        const normalizedName = this._normalizeLevel2ItemName(item.name);
        if (!CHECK_RESULTS[normalizedName]) {
            player.pickUp(item);
            cc.log('[CheckStation] Item cannot be checked here:', item.name);
            return;
        }

        this._heldItem = item;
        item.parent = this.node;
        item.x = 0;
        item.y = this.itemOffsetY;
        this._setItemDisplayOnStation(item);

        this._checking = true;
        this._checkEndTime = this._nowSeconds() + this.checkTime;
        this._showTimerLabel(this.checkTime);
        this.schedule(this._updateTimerLabel, 0.1);
        this.scheduleOnce(this._onCheckDone, this.checkTime);

        EventBus.emit('station:place', {
            stationType: this.stationType,
            col: this.gridCol,
            row: this.gridRow,
            item: item.name,
        });
    },

    _onPickup(player) {
        if (this._checking) {
            cc.log('[CheckStation] Still checking.');
            return;
        }

        if (!this._heldItem) return;

        player.pickUp(this._heldItem);
        this._heldItem = null;
        this._isDone = false;
        this._hideTimerLabel();

        EventBus.emit('station:pickup', {
            stationType: this.stationType,
            col: this.gridCol,
            row: this.gridRow,
        });
    },

    _onCheckDone() {
        this.unschedule(this._updateTimerLabel);
        this._hideTimerLabel();

        if (!this._heldItem) {
            this._checking = false;
            return;
        }

        const normalizedName = this._normalizeLevel2ItemName(this._heldItem.name);
        const result = this._getCheckResult(normalizedName);
        if (!result) {
            this._checking = false;
            return;
        }

        this._heldItem.name = result;
        this._setItemSpriteFrame(this._heldItem, result);

        this._checking = false;
        this._isDone = true;

        EventBus.emit('station:check_done', {
            stationType: this.stationType,
            col: this.gridCol,
            row: this.gridRow,
            result,
        });
    },

    _getCheckResult(itemName) {
        const result = CHECK_RESULTS[itemName];
        if (!result) return null;

        const chance = Math.max(0, Math.min(1, this.brokenChance));
        return Math.random() < chance ? result.broken : result.checked;
    },

    _normalizeLevel2ItemName(itemName) {
        return String(itemName || '').replace(/^noncooked_/, '');
    },

    _nowSeconds() {
        if (cc.director && cc.director.getTotalTime) {
            return cc.director.getTotalTime() / 1000;
        }
        return Date.now() / 1000;
    },

    _ensureTimerLabel() {
        if (this._timerLabel && cc.isValid(this._timerLabel.node)) return this._timerLabel;

        const labelNode = new cc.Node('CheckTimerLabel');
        labelNode.parent = this.node;
        labelNode.x = 0;
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
        if (!this._checking) return;

        const secondsLeft = this._checkEndTime - this._nowSeconds();
        this._showTimerLabel(secondsLeft);
    },

    _hideTimerLabel() {
        this.unschedule(this._updateTimerLabel);
        if (this._timerLabel && cc.isValid(this._timerLabel.node)) {
            this._timerLabel.node.active = false;
        }
    },
});

module.exports = CheckStation;
