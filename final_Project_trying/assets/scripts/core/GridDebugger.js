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

        const b = GridSystem.floorBounds();   // { left, right, top, bottom }
        const CW = GridSystem.CELL_W;         // 63
        const CH = GridSystem.CELL_H;         // 56
        const COLS = GridSystem.COLS;         // 12
        const ROWS = GridSystem.ROWS;         // 8

        // ── 地板邊界框（紅色）────────────────────────────────
        if (this.showBounds) {
            g.strokeColor = new cc.Color(255, 50, 50, 220);
            g.lineWidth   = 2;
            g.rect(b.left, b.bottom, b.right - b.left, b.top - b.bottom);
            g.stroke();
        }

        // ── 格子線（綠色）────────────────────────────────────
        if (this.showGrid) {
            g.strokeColor = new cc.Color(50, 220, 50, 160);
            g.lineWidth   = 1;

            // 垂直線（欄分隔）
            for (let c = 0; c <= COLS; c++) {
                const x = b.left + c * CW;
                g.moveTo(x, b.top);
                g.lineTo(x, b.bottom);
                g.stroke();
            }

            // 水平線（列分隔）
            for (let r = 0; r <= ROWS; r++) {
                const y = b.top - r * CH;
                g.moveTo(b.left,  y);
                g.lineTo(b.right, y);
                g.stroke();
            }
        }

        // ── 格子中心十字（黃色）──────────────────────────────
        if (this.showCenters) {
            g.strokeColor = new cc.Color(255, 220, 0, 200);
            g.lineWidth   = 1;
            const ARM = 4;
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    const pos = GridSystem.toWorld(c, r);
                    g.moveTo(pos.x - ARM, pos.y);
                    g.lineTo(pos.x + ARM, pos.y);
                    g.stroke();
                    g.moveTo(pos.x, pos.y - ARM);
                    g.lineTo(pos.x, pos.y + ARM);
                    g.stroke();
                }
            }
        }

        // ── Blocked 格子（藍色半透明）────────────────────────
        if (this.showBlocked) {
            g.fillColor = new cc.Color(50, 100, 255, 80);
            const blocked = GridSystem.getBlockedCells();
            for (const { col, row } of blocked) {
                const pos = GridSystem.toWorld(col, row);
                g.fillRect(
                    pos.x - CW / 2,
                    pos.y - CH / 2,
                    CW,
                    CH
                );
            }
        }
    },
});

module.exports = GridDebugger;
