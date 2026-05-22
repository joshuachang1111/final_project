/**
 * CuttingBoard  (extends CookingStationBase)
 * 砧板：將食材切割（noncooked_X → X）。
 * 預設 cookTime = 4 秒，可在 Inspector 覆蓋。
 */

const CookingStationBase = require('./CookingStationBase');

const CuttingBoard = cc.Class({
    extends: CookingStationBase,

    properties: {
        cookTime: {
            override: true,
            default:  4,
        },
        // Bug 1 fix: resultPrefix removed from base class, no override needed
    },
});

module.exports = CuttingBoard;
