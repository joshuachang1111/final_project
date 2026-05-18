/**
 * Stove  (extends CookingStationBase)
 * 火爐：將食材烹飪成 'cooked_xxx'。
 *
 * 預設 cookTime = 8 秒，resultPrefix = 'cooked_'
 * 可在 Inspector 覆蓋這兩個值。
 */

const CookingStationBase = require('./CookingStationBase');

const Stove = cc.Class({
    extends: CookingStationBase,

    properties: {
        cookTime: {
            override: true,
            default:  8,
        },
        resultPrefix: {
            override: true,
            default:  'cooked_',
        },
    },
});

module.exports = Stove;
