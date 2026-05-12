/**
 * GridSystem
 * 負責世界座標 ↔ 格子座標的轉換，以及格子的通行狀態管理。
 *
 * Canvas: 960 x 640
 * Grid  : 12 cols x 8 rows, 每格 80 x 80 px
 * 原點  : Canvas 中心 (0, 0)，左上角 (-480, 320)
 */

const CELL_SIZE = 80;
const COLS      = 12;
const ROWS      = 8;

// Canvas 左上角在世界座標中的位置
const ORIGIN_X = -(COLS * CELL_SIZE) / 2;   // -480
const ORIGIN_Y =  (ROWS * CELL_SIZE) / 2;   //  320

// 使用 "col,row" 字串作為 key，儲存不可通行的格子
const _blocked = new Set();

const GridSystem = {
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
            x: ORIGIN_X + col * CELL_SIZE + CELL_SIZE / 2,
            y: ORIGIN_Y - row * CELL_SIZE - CELL_SIZE / 2,
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
            col: Math.floor((worldX - ORIGIN_X) / CELL_SIZE),
            row: Math.floor((ORIGIN_Y - worldY) / CELL_SIZE),
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
