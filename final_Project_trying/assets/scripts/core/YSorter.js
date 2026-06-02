/**
 * YSorter  (cc.Component)
 * 掛在 Stations 和 Players 節點上。
 *
 * 讓子節點根據 Y 座標自動排序：
 * Y 越小（越靠畫面下方）→ zIndex 越高 → 畫在越前面
 * 這樣就能製造 2.5D 的前後深度感。
 */
const YSorter = cc.Class({
    extends: cc.Component,

    update() {
        this.node.children.forEach(child => {
            // Y 越低（越靠下）→ zIndex 越大（畫在前面）
            child.zIndex = Math.round(1000 - child.y);
        });
    },
});

module.exports = YSorter;
