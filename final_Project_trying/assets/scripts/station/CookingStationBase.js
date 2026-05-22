/**
 * CookingStationBase  (extends StationBase)
 * Stove 和 CuttingBoard 的共用邏輯。
 *
 * 流程：
 *   1. 玩家放上食材 (_onPlace)  → 開始倒數
 *   2. 倒數中           → 不能放、不能拿
 *   3. 時間到           → emit station:cook_done，node 名稱去掉 noncooked_ 前綴
 *   4. 完成後           → 玩家可空手來拿 (_onPickup)
 *
 * 子類別需設定：
 *   this.cookTime  — 烹飪秒數（Inspector）
 *
 * EventBus：
 *   emit  station:cook_done  { stationType, col, row, result }
 *   繼承  station:pickup / station:place
 */

const StationBase = require('./StationBase');
const EventBus    = require('../core/EventBus');

const CookingStationBase = cc.Class({
    extends: StationBase,

    properties: {
        /** 烹飪所需秒數 */
        cookTime: {
            default: 5,
            type: cc.Integer,
            tooltip: '烹飪倒數秒數',
        },
        // Bug 1 fix: resultPrefix removed — it was never used.
        // _onCookDone strips the 'noncooked_' prefix to produce the final name,
        // which matches OrderManager RECIPES directly (e.g. 'burger', 'salad').
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        this._super();
        this._cooking = false;
        this._isDone  = false;
    },

    // Bug 2 fix: cancel any in-flight cooking timer when node is destroyed
    // (prevents _onCookDone firing on a destroyed component after scene reload)
    onDestroy() {
        this.unscheduleAllCallbacks();
        this._super();   // StationBase.onDestroy → GridSystem.setBlocked(false)
    },

    // ─────────────────────────────────────────────
    //  override
    // ─────────────────────────────────────────────

    /** 放上食材 → 開始烹飪 */
    _onPlace(player) {
        if (this._cooking || this._isDone) {
            cc.log('[CookingStation] 正在烹飪或已完成，不能放置');
            return;
        }
        if (this._heldItem) {
            cc.log('[CookingStation] 站台上已有物品');
            return;
        }

        const item     = player.dropItem();
        this._heldItem = item;

        if (item) {
            item.parent = this.node;
            item.x = 0;
            item.y = 0;
        }

        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        item ? item.name : null,
        });

        cc.log('[CookingStation] 開始烹飪:', item ? item.name : 'null', '需要', this.cookTime, '秒');
        this._cooking = true;
        this.scheduleOnce(this._onCookDone, this.cookTime);
    },

    /** 拿取：只有烹飪完成後才能拿 */
    _onPickup(player) {
        if (this._cooking) {
            cc.log('[CookingStation] 還在烹飪，請等待');
            return;
        }
        if (!this._isDone || !this._heldItem) {
            cc.log('[CookingStation] 沒有完成品可以拿');
            return;
        }

        player.pickUp(this._heldItem);
        this._heldItem = null;
        this._isDone   = false;

        EventBus.emit('station:pickup', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
        });
    },

    // ─────────────────────────────────────────────
    //  內部
    // ─────────────────────────────────────────────

    _onCookDone() {
        if (!this._heldItem) return;

        // Bug 1 fix: simply strip the 'noncooked_' prefix.
        // Result name matches OrderManager RECIPES (e.g. 'burger').
        this._heldItem.name = this._heldItem.name.replace('noncooked_', '');

        this._cooking = false;
        this._isDone  = true;

        cc.log('[CookingStation] 烹飪完成:', this._heldItem.name);

        EventBus.emit('station:cook_done', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            result:      this._heldItem.name,
        });
    },
});

module.exports = CookingStationBase;
