/**
 * GridSystem
 * 負責世界座標 ↔ 格子座標的轉換，以及格子的通行狀態管理。
 *
 * ── 透視梯形地板（Canvas 1440×720）─────────────────────────
 *
 *  背景圖是等角俯視透視，地板為梯形（下寬上窄）且垂直間距不均勻。
 *  格子邊界由實測世界座標建立查找表，精確對齊背景磁磚。
 *
 *  量測方法：DevTools Console 滑鼠偵測，實測 col=0 各列左下角。
 *
 *  ROW_Y[r]      = 第 r 列的上邊界 y（r=0~8，共 9 條水平線）
 *  ROW_LEFT_X[r] = 第 r 列上邊界左端 x（col=0 左緣）
 *  ROW_RIGHT_X[r]= 第 r 列上邊界右端 x（col=12 右緣，由右上/右下線性插值）
 *
 *  列高（上密下疏，透視效果）：
 *    row0=38, row1=47, row2=49, row3=58,
 *    row4=57, row5=68, row6=71, row7=72
 *
 *  格子中心公式：
 *    centerX(col,row) = ROW_LEFT_X[row] + (col+0.5) × cellW(row)
 *    centerY(col,row) = (ROW_Y[row] + ROW_Y[row+1]) / 2
 */

// ── 行邊界查找表（實測值，canvas 1440×720，world座標）───────────
// 9 條水平邊界線（row 0 上緣 ~ row 7 下緣）
const ROW_Y = [187, 149, 102, 53, -5, -62, -130, -201, -273];

// 各邊界左端 x（col=0 左緣，來自實測）
const ROW_LEFT_X = [-349, -356, -371, -384, -400, -416, -434, -455, -474];

// 各邊界右端 x（col=12 右緣，由兩端角落線性插值）
// 已知：y=187 → 378，y=-273 → 502
const ROW_RIGHT_X = [378, 388, 401, 414, 430, 445, 463, 483, 502];

const COLS = 12;
const ROWS = 8;

// 以下為匯出常數（供外部參考）
const TOP_Y = ROW_Y[0];      // 187
const BOT_Y = ROW_Y[ROWS];   // -273

// 平均格子大小（backward compat）
const CELL_H    = (TOP_Y - BOT_Y) / ROWS;  // 57.5（各列實際高度不同）
const CELL_W    = Math.round(
    ((ROW_RIGHT_X[0] - ROW_LEFT_X[0]) + (ROW_RIGHT_X[ROWS] - ROW_LEFT_X[ROWS])) / 2 / COLS
);   // ≈ 71
const CELL_SIZE = CELL_W;

// ── 輔助：取得某邊界索引的格子寬度 ─────────────────────────────
function _rowCellW(boundaryIdx) {
    const i = Math.max(0, Math.min(ROWS, boundaryIdx));
    return (ROW_RIGHT_X[i] - ROW_LEFT_X[i]) / COLS;
}

// 使用 "col,row" 字串作為 key，儲存不可通行的格子
const _blocked = new Set();

const GridSystem = {
    CELL_W,
    CELL_H,
    CELL_SIZE,
    COLS,
    ROWS,
    TOP_Y,
    BOT_Y,
    ROW_Y,
    ROW_LEFT_X,
    ROW_RIGHT_X,

    /**
     * 格子座標 → 世界座標（格子中心點）
     * @param {number} col
     * @param {number} row
     * @returns {{ x: number, y: number }}
     */
    toWorld(col, row) {
        const r = Math.max(0, Math.min(ROWS - 1, Math.floor(row)));
        const cellW = _rowCellW(r);
        return {
            x: ROW_LEFT_X[r] + col * cellW + cellW / 2,
            y: (ROW_Y[r] + ROW_Y[r + 1]) / 2,
        };
    },

    /**
     * 世界座標 → 格子座標（無條件捨去）
     * @param {number} worldX
     * @param {number} worldY
     * @returns {{ col: number, row: number }}
     */
    toGrid(worldX, worldY) {
        // 找出 worldY 落在哪個 row（ROW_Y 從大到小）
        let row = ROWS - 1;
        for (let r = 0; r < ROWS; r++) {
            if (worldY >= ROW_Y[r + 1]) {
                row = r;
                break;
            }
        }
        const cellW = _rowCellW(row);
        const col = Math.floor((worldX - ROW_LEFT_X[row]) / cellW);
        return { col, row };
    },

    /**
     * 取得指定列的格子寬度（每列不同）
     * @param {number} row  0–7
     */
    getCellWidthAtRow(row) {
        return _rowCellW(Math.max(0, Math.min(ROWS - 1, row)));
    },

    /**
     * 取得格子的 AABB（精確透視邊界，供碰撞解算）
     * @returns {{ left, right, top, bottom, cx, cy }}
     */
    getCellBounds(col, row) {
        const r = Math.max(0, Math.min(ROWS - 1, row));
        const cellW = _rowCellW(r);
        const cx    = ROW_LEFT_X[r] + col * cellW + cellW / 2;
        const cy    = (ROW_Y[r] + ROW_Y[r + 1]) / 2;
        return {
            left:   cx - cellW / 2,
            right:  cx + cellW / 2,
            top:    ROW_Y[r],
            bottom: ROW_Y[r + 1],
            cx, cy,
        };
    },

    /**
     * 取得在特定世界 Y 時地板的左右 X 邊界（透視插值）
     * @param {number} worldY
     * @returns {{ left: number, right: number }}
     */
    getFloorXBoundsAtWorldY(worldY) {
        if (worldY >= ROW_Y[0])    return { left: ROW_LEFT_X[0],    right: ROW_RIGHT_X[0]    };
        if (worldY <= ROW_Y[ROWS]) return { left: ROW_LEFT_X[ROWS], right: ROW_RIGHT_X[ROWS] };

        for (let i = 0; i < ROWS; i++) {
            if (worldY <= ROW_Y[i] && worldY >= ROW_Y[i + 1]) {
                const t = (ROW_Y[i] - worldY) / (ROW_Y[i] - ROW_Y[i + 1]);
                return {
                    left:  ROW_LEFT_X[i]  + t * (ROW_LEFT_X[i + 1]  - ROW_LEFT_X[i]),
                    right: ROW_RIGHT_X[i] + t * (ROW_RIGHT_X[i + 1] - ROW_RIGHT_X[i]),
                };
            }
        }
        return { left: ROW_LEFT_X[ROWS], right: ROW_RIGHT_X[ROWS] };
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
     * 回傳所有不可通行格子的陣列（供碰撞解算使用）
     */
    getBlockedCells() {
        const result = [];
        for (const key of _blocked) {
            const [col, row] = key.split(',').map(Number);
            result.push({ col, row });
        }
        return result;
    },

    /**
     * 地板世界座標邊界（Y 上下端；X 取最寬的底部）
     */
    floorBounds() {
        return {
            left:   ROW_LEFT_X[ROWS],
            right:  ROW_RIGHT_X[ROWS],
            top:    TOP_Y,
            bottom: BOT_Y,
        };
    },

    /**
     * 清除所有格子狀態（換場景時使用）
     */
    reset() {
        _blocked.clear();
    },
};

module.exports = GridSystem;
