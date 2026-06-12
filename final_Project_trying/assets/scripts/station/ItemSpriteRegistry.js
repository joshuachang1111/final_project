// Level2 items 在 img/level2/（非 resources），需要用 UUID 載入
const LEVEL2_UUIDS = {
    iPhone:              'e360cf83-0936-42c8-b985-597e9570dc71',
    Airpods:             '7a58c867-145f-4776-9cf8-0caccf8126c7',
    charger:             'eec2919f-3e7b-4140-9ef7-59993e406a1c',
    iPhone_checked:      '2bdfd05c-8a6b-48ef-a9c6-bcb339e8a736',
    Airpods_checked:     'ac978a28-ff4d-44b2-a1c8-553d6dc27269',
    charger_checked:     '0ea62fc4-067a-4a85-b620-7a2a030a39ab',
    iPhone_broken:       'f6483249-5e32-40e7-9c96-0e89e80cc62b',
    Airpods_broken:      '6491925f-9691-4f8a-a598-0cbae750200a',
    charger_broken:      '70b3b878-ec72-4b47-85bc-d1b9011b1820',
    box:                 '5c64c145-a668-45ed-a244-3c5bc960bf84',
    box_iPhone:          '180d3dba-ce59-4922-a9fd-b1a460c92cd2',
    box_Airpods:         '8cdd3e6d-ea24-4de5-bc50-de1f8a7ae46a',
    box_charger:         '95d96c4f-665b-4e1c-aa44-9099bebb887e',
    box_iPhone_Airpods:  '16fcdca2-55ca-44a1-b8dc-739d6b368843',
    box_iPhone_charger:  '15f77458-b804-4547-b72a-7cf1e92ec228',
    box_Airpods_charger: '5d9dd313-8ca5-44c1-84f1-a24b2cf81d87',
    box_all:             '21f02bdb-7f23-4f5a-890a-fac46d39ed33',
};

// 只套 spriteFrame，不動 itemNode 的 width/height。
// 呼叫端（FoodBox._onPickup）已經把 itemNode 設為 100×100 + sizeMode=CUSTOM，
// prefab 上的 foodScale 是針對「100×100 node」算好的倍率（1024px 食材圖 × 0.07 ≈ 7px）。
function _applyFrame(itemNode, sprite, frame) {
    if (!cc.isValid(itemNode) || !frame) return;
    sprite.spriteFrame = frame;
}

function applySpriteFrame(itemNode, itemName, fallbackFrame) {
    if (!itemNode) return;

    let sprite = itemNode.getComponent(cc.Sprite);
    if (!sprite) sprite = itemNode.addComponent(cc.Sprite);

    // Level2 items：在 img/level2/，UUID 是新建的，正確可用
    const level2uuid = LEVEL2_UUIDS[itemName];
    if (level2uuid) {
        cc.assetManager.loadAny({ uuid: level2uuid }, (err, asset) => {
            if (err || !asset || !cc.isValid(itemNode)) {
                _applyFrame(itemNode, sprite, fallbackFrame);
                if (err) cc.warn('[ItemSpriteRegistry] Level2圖片載入失敗:', itemName, err);
                return;
            }
            _applyFrame(itemNode, sprite, asset);
        });
        return;
    }

    // 食物 items：在 resources/food/，用路徑載入（避免 UUID 過期問題）
    cc.resources.load('food/' + itemName, cc.SpriteFrame, (err, spriteFrame) => {
        if (err || !spriteFrame || !cc.isValid(itemNode)) {
            cc.resources.load('food/' + itemName, cc.Texture2D, (err2, tex) => {
                if (err2 || !tex || !cc.isValid(itemNode)) {
                    _applyFrame(itemNode, sprite, fallbackFrame);
                    if (err2) cc.warn('[ItemSpriteRegistry] 食物圖片載入失敗:', itemName, err2);
                    return;
                }
                _applyFrame(itemNode, sprite, new cc.SpriteFrame(tex));
            });
            return;
        }
        _applyFrame(itemNode, sprite, spriteFrame);
    });
}

module.exports = {
    LEVEL2_UUIDS,
    applySpriteFrame,
};
