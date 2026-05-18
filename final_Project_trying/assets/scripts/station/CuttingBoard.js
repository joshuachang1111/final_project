/**
 * CuttingBoard  (extends CookingStationBase)
 * 砧板：將食材切成 'chopped_xxx'。
 *
 * 預設 cookTime = 4 秒，resultPrefix = 'chopped_'
 * 可在 Inspector 覆蓋這兩個值。
 */

const CookingStationBase = require('./CookingStationBase');

const CuttingBoard = cc.Class({
    extends: CookingStationBase,

    properties: {
        cookTime: {
            override: true,
            default:  4,
        },
        resultPrefix: {
            override: true,
            default:  'chopped_',
        },
    },
});

module.exports = CuttingBoard;
