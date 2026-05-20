/**
 * CookingStationBase  (extends StationBase)
 * Stove 和 CuttingBoard 的共用邏輯。
 *
 * 流程：
 *   1. 玩家放上食材 (_onPlace)  → 開始倒數
 *   2. 倒數中           → 不能放、不能拿
 *   3. 時間到           → emit station:cook_done，node 名稱加上 resultPrefix
 *   4. 完成後           → 玩家可空手來拿 (_onPickup)
 *
 * 子類別需設定：
 *   this.cookTime     — 烹飪秒數（Inspector）
 *   this.resultPrefix — 完成品前綴，例如 'cooked_' 或 'chopped_'
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
        /** 完成品名稱前綴，子類別設定預設值 */
        resultPrefix: {
            default: 'cooked_',
            tooltip: '完成品名稱前綴，例如 cooked_ 或 chopped_',
        },
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        this._super();          // 呼叫 StationBase.onLoad()
        this._cooking  = false; // 是否正在烹飪
        this._isDone   = false; // 是否已完成（等待拿取）
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

        // 從玩家手上拿走食材，放到站台上
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

        // 完成品交給玩家
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

        // 把 node 名稱改成完成品名稱：去掉 noncooked_ 前綴
        const resultName      = this._heldItem.name.replace('noncooked_', '');
        this._heldItem.name   = resultName;

        this._cooking = false;
        this._isDone  = true;

        cc.log('[CookingStation] 烹飪完成:', resultName);

        EventBus.emit('station:cook_done', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            result:      resultName,
        });
    },
});

module.exports = CookingStationBase;
