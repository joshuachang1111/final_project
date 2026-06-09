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
const EventBus    = require('../core/EventBus');
const ItemSprites = require('./ItemSpriteRegistry');

const FOOD_NAME_BY_NODE = {
    FoodBox_Bread:    'bread',
    FoodBox_Onion:    'onion',
    FoodBox_Tomato:   'tomato',
    FoodBox_Meat:     'raw_meat',
    FoodBox_Toast:    'toast',
    FoodBox_Chocojam: 'chocolate_jam',
    FoodBox_Blacktea: 'black_tea',
};

const FoodBox = cc.Class({
    extends: StationBase,

    properties: {
        /** 這個食材箱提供的食材名稱，需與 RECIPES 一致 */
        foodType: {
            default: 'burger',
            tooltip: '食材名稱，需與 OrderManager RECIPES 中的 recipe 一致',
        },

        // 直接在編輯器把那張圖拖過來
        foodSpriteFrame: {
            default: null,
            type: cc.SpriteFrame,
            tooltip: '拖曳對應的食材圖片到這裡',
        },

        foodScale: {
            default: 0.5, // 預設 0.5，之後可以在編輯器調整
            tooltip: '食物被拿出來時的縮放比例',
        },
    },

    // ─────────────────────────────────────────────
    //  override
    // ─────────────────────────────────────────────

    /** 空手互動：產生新食材給玩家，不需要站台上有物品 */
    _onPickup(player) {
        const foodName = this._getFoodName();
        const itemNode = new cc.Node(foodName);

        // 先給一個預設大小
        itemNode.width = 100;
        itemNode.height = 100;

        // --- 強制套用你的縮放 ---
        itemNode.setScale(this.foodScale);
        itemNode._carryScale = this.foodScale;

        const sprite = itemNode.addComponent(cc.Sprite);
        ItemSprites.applySpriteFrame(itemNode, foodName, this.foodSpriteFrame);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        player.pickUp(itemNode);

        // 父類 StationBase._onPickup 會 emit 'station:pickup' 給 GameNetworkBridge 同步，
        // 但 FoodBox override 完整替換了 _onPickup，原本漏掉這個 emit 導致對方收不到事件、
        // 看不到對方手上的食材。這裡補上，item 帶 itemNode.name 讓對方那邊也能對齊 sprite。
        EventBus.emit('station:pickup', {
            stationType: this.stationType,
            col:         this.gridCol,
            row:         this.gridRow,
            item:        itemNode.name,
        });
    },

    _getFoodName() {
        if (FOOD_NAME_BY_NODE[this.node.name]) return FOOD_NAME_BY_NODE[this.node.name];
        if (this.foodType && this.foodType !== 'burger') return this.foodType;
        if (this.foodSpriteFrame && this.foodSpriteFrame.name) return this.foodSpriteFrame.name;
        return this.foodType;
    },

    /** 食材箱不接受放置 */
    _onPlace(player) {
        cc.log('[FoodBox] 不能放東西進食材箱');
    },
});

module.exports = FoodBox;
