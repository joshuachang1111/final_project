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
};

function applySpriteFrame(itemNode, itemName, fallbackFrame) {
    if (!itemNode) return;

    let sprite = itemNode.getComponent(cc.Sprite);
    if (!sprite) sprite = itemNode.addComponent(cc.Sprite);

    const uuid = ITEM_SPRITE_UUIDS[itemName];
    if (!uuid || !cc.assetManager || !cc.assetManager.loadAny) {
        if (fallbackFrame) sprite.spriteFrame = fallbackFrame;
        return;
    }

    cc.assetManager.loadAny({ uuid }, (err, asset) => {
        if (err || !asset || !cc.isValid(itemNode)) {
            if (fallbackFrame && cc.isValid(itemNode)) sprite.spriteFrame = fallbackFrame;
            if (err) cc.warn('[ItemSpriteRegistry] 圖片載入失敗:', itemName, err);
            return;
        }
        sprite.spriteFrame = asset;
    });
}

module.exports = {
    ITEM_SPRITE_UUIDS,
    applySpriteFrame,
};
