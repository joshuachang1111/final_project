/**
 * ServingCounter  (extends StationBase)
 * 出餐口：玩家放上物品時嘗試配對訂單。
 *
 * 配對成功 → 物品銷毀，OrderManager 加分並 emit order:completed
 * 配對失敗 → 物品還給玩家，印出 log
 *
 * EventBus：
 *   繼承 StationBase 的 station:place
 */

const StationBase    = require('./StationBase');
const OrderManager   = require('./OrderManager');

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

        const success = OrderManager.instance
            ? OrderManager.instance.completeOrder(item.name)
            : false;

        if (success) {
            // 配對成功：銷毀食物 node
            cc.log('[ServingCounter] 出餐成功！');
            item.destroy();
        } else {
            // 配對失敗：歸還給玩家
            cc.log('[ServingCounter] 沒有符合的訂單，退回食物');
            player.pickUp(item);
        }
    },

    /** 出餐口不提供拿取 */
    _onPickup(player) {
        cc.log('[ServingCounter] 出餐口沒有東西可以拿');
    },
});

module.exports = ServingCounter;
