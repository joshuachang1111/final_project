const ITEM_SPRITE_UUIDS = {
    black_tea:          'd2ca8cc7-1ebe-4b86-ae70-a76524214e5d',
    bread:              '78987d7f-21ba-4452-9753-22d1cf808301',
    bread_meat:         'df2a5d64-0d14-432d-8888-c3b59d3457f2',
    bread_meat_onion:   '1864793b-baa0-41fa-8b30-df56b0836cdb',
    bread_meat_tomato:  'e9f0b01e-1f33-4abc-95e0-95de5a11ea46',
    bread_onion:        'b2385982-ce69-431a-9729-671005196644',
    bread_tomato:       '81d01fc4-0798-47e1-89a5-2a35cfa6cff1',
    bread_tomato_onion: 'c8ed2d9c-b898-4836-83c3-70fda00a43fd',
    chocolate_jam:      '746bdf3b-31e9-45a5-8b1e-f16965c3b70d',
    chocolate_toast:    '2852a228-625f-42e5-8169-cb444d858f67',
    hamburger:          '884f716c-3121-4004-b6dc-93507f75d25c',
    meat:               '889dda79-0e05-421b-9104-9fa3769fb99e',
    onion:              '2db2659b-3c86-4c1c-9417-3a5dabe28074',
    onion_sliced:       'c7c3dd01-0912-4d40-a9c0-5fd953784fd8',
    raw_meat:           '139c0b97-0f65-4ddb-8287-6c9766d4e6ba',
    toast:              '7ce48fd1-2a77-458d-be4c-bacff26a6db8',
    tomato:             '24a0e3c7-9e29-4185-8732-c3d36b2a27ad',
    tomato_sliced:      '9dfac34e-7be9-439a-ae7b-801f8490c8f3',
    iPhone:             'e360cf83-0936-42c8-b985-597e9570dc71',
    Airpods:            '7a58c867-145f-4776-9cf8-0caccf8126c7',
    charger:            'eec2919f-3e7b-4140-9ef7-59993e406a1c',
    iPhone_checked:     '2bdfd05c-8a6b-48ef-a9c6-bcb339e8a736',
    Airpods_checked:    'ac978a28-ff4d-44b2-a1c8-553d6dc27269',
    charger_checked:    '0ea62fc4-067a-4a85-b620-7a2a030a39ab',
    iPhone_broken:      'f6483249-5e32-40e7-9c96-0e89e80cc62b',
    Airpods_broken:     '6491925f-9691-4f8a-a598-0cbae750200a',
    charger_broken:     '70b3b878-ec72-4b47-85bc-d1b9011b1820',
    box:                '5c64c145-a668-45ed-a244-3c5bc960bf84',
    box_iPhone:         '180d3dba-ce59-4922-a9fd-b1a460c92cd2',
    box_Airpods:        '8cdd3e6d-ea24-4de5-bc50-de1f8a7ae46a',
    box_charger:        '95d96c4f-665b-4e1c-aa44-9099bebb887e',
    box_iPhone_Airpods: '16fcdca2-55ca-44a1-b8dc-739d6b368843',
    box_iPhone_charger: '15f77458-b804-4547-b72a-7cf1e92ec228',
    box_Airpods_charger:'5d9dd313-8ca5-44c1-84f1-a24b2cf81d87',
    box_all:            '21f02bdb-7f23-4f5a-890a-fac46d39ed33',
};

// 只套 spriteFrame，不動 itemNode 的 width/height。
// 呼叫端（FoodBox._onPickup）已經把 itemNode 設為 100×100 + sizeMode=CUSTOM，
// prefab 上的 foodScale 是針對「100×100 node」算好的倍率（1024px 食材圖 × 0.07 ≈ 7px）。
// 之前曾經在這裡用 spriteFrame.getRect() 把 node 撐到原圖大小 (1024×1024)，
// 結果 1024 × foodScale(0.07) ≈ 72px → 拿到的食材變超大。
function _applyFrame(itemNode, sprite, frame) {
    if (!cc.isValid(itemNode) || !frame) return;
    sprite.spriteFrame = frame;
}

function applySpriteFrame(itemNode, itemName, fallbackFrame) {
    if (!itemNode) return;

    let sprite = itemNode.getComponent(cc.Sprite);
    if (!sprite) sprite = itemNode.addComponent(cc.Sprite);

    const uuid = ITEM_SPRITE_UUIDS[itemName];
    if (!uuid || !cc.assetManager || !cc.assetManager.loadAny) {
        _applyFrame(itemNode, sprite, fallbackFrame);
        return;
    }

    cc.assetManager.loadAny({ uuid }, (err, asset) => {
        if (err || !asset || !cc.isValid(itemNode)) {
            _applyFrame(itemNode, sprite, fallbackFrame);
            if (err) cc.warn('[ItemSpriteRegistry] 圖片載入失敗:', itemName, err);
            return;
        }
        _applyFrame(itemNode, sprite, asset);
    });
}

module.exports = {
    ITEM_SPRITE_UUIDS,
    applySpriteFrame,
};
