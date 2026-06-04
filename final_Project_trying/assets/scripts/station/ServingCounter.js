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

        // completeOrder 現在回傳被消掉的 order 物件（含 id），失敗回 null
        const completed = OrderManager.instance
            ? OrderManager.instance.completeOrder(item.name)
            : null;

        if (completed) {
            cc.log('[ServingCounter] 出餐成功！orderId=', completed.id);
            item.destroy();
        } else {
            cc.log('[ServingCounter] 沒有符合的訂單，退回食物');
            player.pickUp(item);
        }

        // 帶上 orderId，讓對端用 id 精準移除（避免兩邊配對到不同的同名訂單）
        EventBus.emit('station:serve', {
            col:     this.gridCol,
            row:     this.gridRow,
            item:    item.name,
            orderId: completed ? completed.id : -1,
            success: !!completed,
        });
    },

    /** 出餐口不提供拿取 */
    _onPickup(player) {
        cc.log('[ServingCounter] 出餐口沒有東西可以拿');
    },
});

module.exports = ServingCounter;
