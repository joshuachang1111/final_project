// Level2 item 名稱列表（現在放在 resources/level2/，用路徑載入）
const LEVEL2_ITEMS = new Set([
    'iPhone', 'Airpods', 'charger',
    'iPhone_checked', 'Airpods_checked', 'charger_checked',
    'iPhone_broken', 'Airpods_broken', 'charger_broken',
    'box', 'box_iPhone', 'box_Airpods', 'box_charger',
    'box_iPhone_Airpods', 'box_iPhone_charger', 'box_Airpods_charger', 'box_all',
]);

// 只套 spriteFrame，不動 itemNode 的 width/height。
// 呼叫端（FoodBox._onPickup）已經把 itemNode 設為 100×100 + sizeMode=CUSTOM，
// prefab 上的 foodScale 是針對「100×100 node」算好的倍率。
function _applyFrame(itemNode, sprite, frame) {
    if (!cc.isValid(itemNode) || !frame) return;
    sprite.spriteFrame = frame;
}

function _loadByPath(basePath, itemName, itemNode, sprite, fallbackFrame) {
    cc.resources.load(basePath + itemName, cc.SpriteFrame, (err, spriteFrame) => {
        if (err || !spriteFrame || !cc.isValid(itemNode)) {
            cc.resources.load(basePath + itemName, cc.Texture2D, (err2, tex) => {
                if (err2 || !tex || !cc.isValid(itemNode)) {
                    _applyFrame(itemNode, sprite, fallbackFrame);
                    if (err2) cc.warn('[ItemSpriteRegistry] 圖片載入失敗:', itemName, err2);
                    return;
                }
                _applyFrame(itemNode, sprite, new cc.SpriteFrame(tex));
            });
            return;
        }
        _applyFrame(itemNode, sprite, spriteFrame);
    });
}

function applySpriteFrame(itemNode, itemName, fallbackFrame) {
    if (!itemNode) return;

    let sprite = itemNode.getComponent(cc.Sprite);
    if (!sprite) sprite = itemNode.addComponent(cc.Sprite);

    if (LEVEL2_ITEMS.has(itemName)) {
        // Level2 items：已移至 resources/level2/，用路徑載入
        _loadByPath('level2/', itemName, itemNode, sprite, fallbackFrame);
    } else {
        // 食物 items：在 resources/food/，用路徑載入
        _loadByPath('food/', itemName, itemNode, sprite, fallbackFrame);
    }
}

module.exports = {
    LEVEL2_ITEMS,
    applySpriteFrame,
};
