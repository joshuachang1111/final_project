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
        foodType: {
            default: 'burger',
            tooltip: 'Item name this box provides',
        },
        foodSpriteFrame: {
            default: null,
            type: cc.SpriteFrame,
            tooltip: 'Fallback sprite for the spawned item',
        },
        foodScale: {
            default: 0.5,
            tooltip: 'Scale for the spawned held item',
        },
    },

    _onPickup(player) {
        // 防呆：game.fire 內 foodScale 偶爾會被 Cocos 編輯器 / 隊友存檔重置成 1，
        // 1 = sprite 原生 1024×1024 → 食材在角色頭上爆大。正常值在 0.4–0.6。
        // 拿到 >= 0.9 一律當成被重置，強制壓回 0.5（跟 script default 一致）。
        const safeScale = this.foodScale >= 0.9 ? 0.5 : this.foodScale;

        const foodName = this._getFoodName();
        const itemNode = new cc.Node(foodName);

        itemNode.width = 100;
        itemNode.height = 100;
        itemNode.setScale(safeScale);
        itemNode._carryScale = safeScale;

        const sprite = itemNode.addComponent(cc.Sprite);
        ItemSprites.applySpriteFrame(itemNode, foodName, this.foodSpriteFrame);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        player.pickUp(itemNode);

        // FoodBox component 本身就是 FOOD_BOX，不信任 this.stationType。
        // game.fire 裡部分 FoodBox（toast / chocolate_jam / black_tea）被誤設為 'STOVE'，
        // 廣播後 GameNetworkBridge._applyRemoteStation 走錯分支（Regular/Cooking 而非
        // FOOD_BOX），P2 端只會建一個 40×40 空白 proxy → 看不到食材，
        // 後續放桌上合成 chocolate_toast 時 sizeMode=TRIMMED 又把 node 撐到 1024×1024 → 變超大。
        EventBus.emit('station:pickup', {
            stationType: 'FOOD_BOX',
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

    _onPlace(player) {
        cc.log('[FoodBox] Cannot place items into a food box.');
    },
});

module.exports = FoodBox;
