/**
 * GridDebugger  (cc.Component)
 * 開發用：在畫面上畫出格子線、地板邊界、blocked 格子，
 * 方便確認格子系統與背景圖是否對齊。
 *
 * 使用方式：
 *   1. 在場景建立一個空節點（例如命名 "GridDebug"）
 *   2. 在 Inspector 點 Add Component → GridDebugger
 *   3. 在同一個節點加上 cc.Graphics component
 *   4. Preview，格子線會疊在畫面上
 *   5. 確認對齊後，關掉或刪掉此節點（不影響正式流程）
 *
 * Inspector 可調整：
 *   showGrid      是否顯示所有格子線（綠色）
 *   showBounds    是否顯示地板外框（紅色）
 *   showBlocked   是否顯示被佔用的格子（藍色半透明）
 *   showCenters   是否在每格中心畫小十字（黃色）
 */

const GridSystem = require('./GridSystem');

const GridDebugger = cc.Class({
    extends: cc.Component,

    properties: {
        showGrid: {
            default: true,
            tooltip: '顯示 12×8 格子線（綠色）',
        },
        showBounds: {
            default: true,
            tooltip: '顯示地板邊界框（紅色）',
        },
        showBlocked: {
            default: true,
            tooltip: '顯示 blocked 格子（藍色）',
        },
        showCenters: {
            default: false,
            tooltip: '顯示每格中心的小十字（黃色）',
        },
    },

    start() {
        this._g = this.node.getComponent(cc.Graphics);
        if (!this._g) {
            cc.warn('[GridDebugger] 請在同一節點加上 cc.Graphics component');
            return;
        }
        // 確保此節點在所有物件上層（zIndex 高）
        this.node.zIndex = 999;
        this._draw();
    },

    _draw() {
        const g = this._g;
        g.clear();

        const COLS     = GridSystem.COLS;
        const ROWS     = GridSystem.ROWS;
        const ROW_Y    = GridSystem.ROW_Y;
        const ROW_LX   = GridSystem.ROW_LEFT_X;
        const ROW_RX   = GridSystem.ROW_RIGHT_X;

        // ── 透視梯形外框（紅色）──────────────────────────────
        if (this.showBounds) {
            g.strokeColor = new cc.Color(255, 50, 50, 220);
            g.lineWidth   = 2;
            g.moveTo(ROW_LX[0],    ROW_Y[0]);
            g.lineTo(ROW_RX[0],    ROW_Y[0]);
            g.lineTo(ROW_RX[ROWS], ROW_Y[ROWS]);
            g.lineTo(ROW_LX[ROWS], ROW_Y[ROWS]);
            g.lineTo(ROW_LX[0],    ROW_Y[0]);
            g.stroke();
        }

        // ── 格子線（綠色）────────────────────────────────────
        if (this.showGrid) {
            g.strokeColor = new cc.Color(50, 220, 50, 160);
            g.lineWidth   = 1;

            // 水平線：每條邊界線用實測的左右端點
            for (let i = 0; i <= ROWS; i++) {
                g.moveTo(ROW_LX[i], ROW_Y[i]);
                g.lineTo(ROW_RX[i], ROW_Y[i]);
                g.stroke();
            }

            // 垂直線：每欄邊界連接 9 個實測點（透視折線）
            for (let c = 0; c <= COLS; c++) {
                for (let i = 0; i < ROWS; i++) {
                    const cellW0 = (ROW_RX[i]   - ROW_LX[i])   / COLS;
                    const cellW1 = (ROW_RX[i+1] - ROW_LX[i+1]) / COLS;
                    const x0 = ROW_LX[i]   + c * cellW0;
                    const x1 = ROW_LX[i+1] + c * cellW1;
                    if (i === 0) g.moveTo(x0, ROW_Y[i]);
                    else         g.moveTo(x0, ROW_Y[i]);
                    g.lineTo(x1, ROW_Y[i + 1]);
                    g.stroke();
                }
            }
        }

        // ── 格子中心十字（黃色）──────────────────────────────
        if (this.showCenters) {
            g.strokeColor = new cc.Color(255, 220, 0, 200);
            g.lineWidth   = 1;
            const ARM = 5;
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    const pos = GridSystem.toWorld(c, r);
                    g.moveTo(pos.x - ARM, pos.y); g.lineTo(pos.x + ARM, pos.y); g.stroke();
                    g.moveTo(pos.x, pos.y - ARM); g.lineTo(pos.x, pos.y + ARM); g.stroke();
                }
            }
        }

        // ── Blocked 格子（藍色半透明）────────────────────────
        if (this.showBlocked) {
            g.fillColor = new cc.Color(50, 100, 255, 80);
            const blocked = GridSystem.getBlockedCells();
            for (const { col, row } of blocked) {
                const b = GridSystem.getCellBounds(col, row);
                g.fillRect(b.left, b.bottom, b.right - b.left, b.top - b.bottom);
            }
        }
    },
});

module.exports = GridDebugger;
