/**
 * GridSystem
 * 負責世界座標 ↔ 格子座標的轉換，以及格子的通行狀態管理。
 *
 * ── 2.5D 俯視背景座標系 ──────────────────────────────────
 *
 *  背景圖（960×640 stretch）內，木框內側可走地板範圍：
 *    螢幕 x : 93 ~ 850 px  (寬 757 px)
 *    螢幕 y : 122 ~ 569 px (高 447 px)
 *
 *  格子設定：
 *    12 欄（col）× 8 列（row）
 *    CELL_W = 63 px（水平，等同場景 X 方向每格寬度）
 *    CELL_H = 56 px（縱向，因等角透視壓縮，比 CELL_W 小）
 *
 *  CC 世界座標（Canvas 中心 = 0,0，Y 軸向上為正）：
 *    ORIGIN_X = -387  (木框左內緣，螢幕 93 px = 93-480)
 *    ORIGIN_Y =  198  (木框上內緣，螢幕 122 px = 320-122)
 *
 *  格子中心世界座標公式：
 *    x = ORIGIN_X + col × CELL_W + CELL_W / 2
 *    y = ORIGIN_Y - row × CELL_H - CELL_H / 2
 *
 *  範例（格子中心）：
 *    (0,0)   → world(-355.5,  170)  螢幕(124, 150)  左上角
 *    (11,7)  → world( 337.5, -222)  螢幕(817, 542)  右下角
 *    (6,3)   → world( -10.5,   58)  螢幕(469, 262)  接近中心
 */

const CELL_W = 63;   // 每格水平寬度（螢幕像素）
const CELL_H = 56;   // 每格縱向高度（螢幕像素，等角壓縮）
const CELL_SIZE = 60; // 平均格子大小，供舊程式碼參考
const COLS = 12;
const ROWS = 8;

// 木框內側左上角在世界座標中的位置
const ORIGIN_X = -387;  // 螢幕 93px → 93 - 480 = -387
const ORIGIN_Y =  198;  // 螢幕 122px → 320 - 122 = 198

// 使用 "col,row" 字串作為 key，儲存不可通行的格子
const _blocked = new Set();

const GridSystem = {
    CELL_W,
    CELL_H,
    CELL_SIZE,
    COLS,
    ROWS,

    /**
     * 格子座標 → 世界座標（格子中心點）
     * @param {number} col
     * @param {number} row
     * @returns {{ x: number, y: number }}
     */
    toWorld(col, row) {
        return {
            x: ORIGIN_X + col * CELL_W + CELL_W / 2,
            y: ORIGIN_Y - row * CELL_H - CELL_H / 2,
        };
    },

    /**
     * 世界座標 → 格子座標（無條件捨去）
     * @param {number} worldX
     * @param {number} worldY
     * @returns {{ col: number, row: number }}
     */
    toGrid(worldX, worldY) {
        return {
            col: Math.floor((worldX - ORIGIN_X) / CELL_W),
            row: Math.floor((ORIGIN_Y - worldY) / CELL_H),
        };
    },

    /**
     * 確認格子是否在地圖範圍內
     */
    isInBounds(col, row) {
        return col >= 0 && col < COLS && row >= 0 && row < ROWS;
    },

    /**
     * 設定格子的通行狀態（由 StationBase 在 onLoad/onDestroy 呼叫）
     */
    setBlocked(col, row, blocked) {
        const key = `${col},${row}`;
        if (blocked) _blocked.add(key);
        else         _blocked.delete(key);
    },

    /**
     * 確認格子是否可通行（在範圍內且未被佔用）
     */
    isWalkable(col, row) {
        if (!this.isInBounds(col, row)) return false;
        return !_blocked.has(`${col},${row}`);
    },

    /**
     * 清除所有格子狀態（換場景時使用）
     */
    reset() {
        _blocked.clear();
    },
};

module.exports = GridSystem;
