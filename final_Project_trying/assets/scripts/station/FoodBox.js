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
        const foodName = this._getFoodName();
        const itemNode = new cc.Node(foodName);

        itemNode.width = 100;
        itemNode.height = 100;
        itemNode.setScale(this.foodScale);
        itemNode._carryScale = this.foodScale;

        const sprite = itemNode.addComponent(cc.Sprite);
        ItemSprites.applySpriteFrame(itemNode, foodName, this.foodSpriteFrame);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        player.pickUp(itemNode);

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

    _onPlace(player) {
        cc.log('[FoodBox] Cannot place items into a food box.');
    },
});

module.exports = FoodBox;
