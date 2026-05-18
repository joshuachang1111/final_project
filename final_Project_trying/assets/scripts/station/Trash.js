/**
 * Trash  (extends StationBase)
 * 垃圾桶：放上任何物品後直接銷毀。
 *
 * EventBus：
 *   繼承 StationBase 的 station:place（物品名稱為被丟棄的物品）
 */

const StationBase = require('./StationBase');

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
        item.destroy();

        // 通知其他模組（站台座標、物品名稱）
        const EventBus = require('../core/EventBus');
        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        item.name,
        });
    },
});

module.exports = Trash;
