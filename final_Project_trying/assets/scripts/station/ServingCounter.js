/**
 * ServingCounter  (extends StationBase)
 * 出餐口：玩家放上物品時嘗試配對訂單。
 *
 * 配對成功 → 物品銷毀，OrderManager 加分並 emit order:completed
 * 配對失敗 → 物品還給玩家，印出 log
 *
 * EventBus：
 *   emit  station:place   { stationType, col, row, item }   （Bug 3 fix：補回遺漏的 emit）
 *   emit  station:serve   { col, row, item, success }       （供 GameNetworkBridge 同步出餐結果）
 *   繼承  StationBase 的其他行為
 */

const StationBase  = require('./StationBase');
const OrderManager = require('./OrderManager');
const EventBus     = require('../core/EventBus');

const ServingCounter = cc.Class({
    extends: StationBase,

    // ─────────────────────────────────────────────
    //  override
    // ─────────────────────────────────────────────

    /** 放上物品 → 嘗試配對訂單 */
    _onPlace(player) {
        const item = player.dropItem();
        if (!item) return;

        cc.log('[ServingCounter] 嘗試出餐:', item.name);

        // Bug 3 fix: emit station:place so GameNetworkBridge can observe
        // (Bridge will filter SERVING type and use station:serve for actual sync)
        EventBus.emit('station:place', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        item.name,
        });

        const success = OrderManager.instance
            ? OrderManager.instance.completeOrder(item.name)
            : false;

        if (success) {
            cc.log('[ServingCounter] 出餐成功！');
            item.destroy();
        } else {
            cc.log('[ServingCounter] 沒有符合的訂單，退回食物');
            player.pickUp(item);
        }

        // Bug 3 fix: dedicated serve event so Bridge can sync the result
        // without replaying the full interaction (which would double-score)
        EventBus.emit('station:serve', {
            col:     this.gridCol,
            row:     this.gridRow,
            item:    item.name,
            success: success,
        });
    },

    /** 出餐口不提供拿取 */
    _onPickup(player) {
        cc.log('[ServingCounter] 出餐口沒有東西可以拿');
    },
});

module.exports = ServingCounter;
