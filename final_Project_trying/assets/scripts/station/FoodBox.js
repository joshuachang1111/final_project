/**
 * FoodBox  (extends StationBase)
 * 食材箱：空手互動時無限產生食材 node。
 *
 * Inspector 屬性：
 *   foodType  — 產生的食材名稱（例如 'burger'、'salad'），
 *               需與 OrderManager 的 RECIPES 中的 recipe 一致。
 *
 * EventBus：
 *   繼承 StationBase 的 station:pickup
 */

const StationBase = require('./StationBase');

const FoodBox = cc.Class({
    extends: StationBase,

    properties: {
        /** 這個食材箱提供的食材名稱，需與 RECIPES 一致 */
        foodType: {
            default: 'burger',
            tooltip: '食材名稱，需與 OrderManager RECIPES 中的 recipe 一致',
        },
    },

    // ─────────────────────────────────────────────
    //  override
    // ─────────────────────────────────────────────

    /** 空手互動：產生新食材給玩家，不需要站台上有物品 */
    _onPickup(player) {
        cc.log('[FoodBox] 產生食材:', 'noncooked_' + this.foodType);

        // 建立一個代表食材的節點，名稱加上 noncooked_ 前綴
        const itemNode  = new cc.Node('noncooked_' + this.foodType);
        itemNode.width  = 40;
        itemNode.height = 40;

        // 加上純色 Sprite 作為視覺佔位（之後換成正式圖片）
        const sprite = itemNode.addComponent(cc.Sprite);
        sprite.spriteFrame = null;

        player.pickUp(itemNode);
    },

    /** 食材箱不接受放置 */
    _onPlace(player) {
        cc.log('[FoodBox] 不能放東西進食材箱');
    },
});

module.exports = FoodBox;
