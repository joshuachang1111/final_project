/**
 * Trash  (extends StationBase)
 * 垃圾桶：放上任何物品後直接銷毀。
 *
 * EventBus：
 *   emit  station:place  { stationType, col, row, item }
 */

const StationBase = require('./StationBase');
const EventBus    = require('../core/EventBus');   // Bug 5 fix: moved to top

const Trash = cc.Class({
    extends: StationBase,

    // ─────────────────────────────────────────────
    //  override
    // ─────────────────────────────────────────────

    /** 放上物品 → 從玩家手上取走並銷毀 */
    _onPlace(player) {
        const item = player.dropItem();
        if (!item) return;

        cc.log('[Trash] 銷毀物品:', item.name);

        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        item.name,
        });

        item.destroy();
    },
});

module.exports = Trash;
