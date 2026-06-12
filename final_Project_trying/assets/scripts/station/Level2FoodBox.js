const StationBase = require('./StationBase');
const EventBus = require('../core/EventBus');
const ItemSprites = require('./ItemSpriteRegistry');

const LEVEL2_FOOD_BY_NODE = {
    FoodBox_Box: 'box',
    FoodBox_iPhone: 'iPhone',
    FoodBox_Airpods: 'Airpods',
    FoodBox_Charger: 'charger',
};

const LEVEL2_VALID_FOODS = ['box', 'iPhone', 'Airpods', 'charger'];

const Level2FoodBox = cc.Class({
    extends: StationBase,

    properties: {
        foodType: {
            default: 'box',
            tooltip: 'Level2 item name this box provides: box / iPhone / Airpods / charger',
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
            stationType: 'FOOD_BOX',
            col: this.gridCol,
            row: this.gridRow,
            item: itemNode.name,
        });
    },

    _getFoodName() {
        const byNode = LEVEL2_FOOD_BY_NODE[this.node.name];
        if (byNode) return byNode;

        if (LEVEL2_VALID_FOODS.indexOf(this.foodType) !== -1) {
            return this.foodType;
        }

        if (this.foodSpriteFrame && this.foodSpriteFrame.name) {
            const frameName = this.foodSpriteFrame.name;
            if (LEVEL2_VALID_FOODS.indexOf(frameName) !== -1) return frameName;
        }

        return 'box';
    },

    _onPlace() {
        cc.log('[Level2FoodBox] Cannot place items into a food box.');
    },
});

module.exports = Level2FoodBox;
