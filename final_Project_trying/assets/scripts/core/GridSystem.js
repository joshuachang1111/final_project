/**
 * GridSystem
 * 負責世界座標 ↔ 格子座標的轉換，以及格子的通行狀態管理。
 *
 * 2.5D 座標系：
 *   X 軸 → 水平左右（不變）
 *   Y 軸 → 垂直高度，地面固定為 0
 *   Z 軸 → 前後深度（row 增大 → Z 增大 → 靠近相機）
 *
 * Grid : 12 cols x 8 rows, 每格 80 x 80 px
 * 範圍 : X ∈ [-480, 480]，Z ∈ [-320, 320]
 */

const CELL_SIZE = 80;
const COLS      = 12;
const ROWS      = 8;

// 世界座標原點（格子 (0,0) 的左上角）
const ORIGIN_X = -(COLS * CELL_SIZE) / 2;   // -480
const ORIGIN_Y =  (ROWS * CELL_SIZE) / 2;   //  320（保留給 2D alias）
const ORIGIN_Z = -(ROWS * CELL_SIZE) / 2;   // -320（row 0 最遠端）

// 使用 "col,row" 字串作為 key，儲存不可通行的格子
const _blocked = new Set();

const GridSystem = {
    CELL_SIZE,
    COLS,
    ROWS,

    /**
     * 格子座標 → 3D 世界座標（格子中心點，Y=0 地面）
     * @param {number} col
     * @param {number} row
     * @returns {cc.Vec3}
     */
    toWorld3D(col, row) {
        return new cc.Vec3(
            ORIGIN_X + col * CELL_SIZE + CELL_SIZE / 2,   // X：水平
            0,                                             // Y：地面
            ORIGIN_Z + row * CELL_SIZE + CELL_SIZE / 2,   // Z：深度
        );
    },

    /**
     * 格子座標 → 世界座標（向後相容 alias，呼叫 toWorld3D）
     * @param {number} col
     * @param {number} row
     * @returns {cc.Vec3}
     */
    toWorld(col, row) {
        return this.toWorld3D(col, row);
    },

    /**
     * 3D 世界座標 → 格子座標（無條件捨去）
     * @param {number} worldX
     * @param {number} worldZ
     * @returns {{ col: number, row: number }}
     */
    toGrid(worldX, worldZ) {
        return {
            col: Math.floor((worldX - ORIGIN_X) / CELL_SIZE),
            row: Math.floor((worldZ - ORIGIN_Z) / CELL_SIZE),
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
