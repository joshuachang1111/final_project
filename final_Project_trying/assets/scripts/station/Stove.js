/**
 * Stove  (extends CookingStationBase)
 * 火爐：將食材烹飪（noncooked_X → X）。
 * 預設 cookTime = 8 秒，可在 Inspector 覆蓋。
 */

const CookingStationBase = require('./CookingStationBase');

const Stove = cc.Class({
    extends: CookingStationBase,

    properties: {
        cookTime: {
            override: true,
            default:  8,
        },
        // Bug 1 fix: resultPrefix removed from base class, no override needed
    },
});

module.exports = Stove;
