/**
 * ConveyorBelt  (cc.Component)
 * 輸送帶：定時在頂部生成食材節點，食材沿格子座標系向下移動，到底部消失。
 *
 * 食材位置以「邊界索引 t」表示（t=0 = ROW_Y[0] 頂端；t=8 = ROW_Y[8] 底端）。
 * 每幀根據 itemSpeed(px/s) 換算 dt，讓視覺速度在螢幕上大致固定，
 * 且 X 座標同步跟著透視梯形縮放，食材始終貼合格子欄。
 *
 * 視覺輸送帶：用 cc.Graphics 繪製灰色梯形色塊對齊格子欄。
 *
 * Properties（Inspector）：
 *   beltCol      : 輸送帶所在的 grid 欄（0-11）
 *   spawnInterval: 幾秒生成一個食材
 *   itemSpeed    : 食材移動速度 px/s（螢幕空間）
 */

const GridSystem       = require('./GridSystem');
// 直接用遊戲原本的 ItemSpriteRegistry 套圖（cc.assetManager.loadAny + 正確 UUID）
const ItemSpriteRegistry = require('../station/ItemSpriteRegistry');

const FOOD_TYPES        = ['bread', 'meat', 'onion_sliced', 'tomato_sliced'];
const ITEM_DISPLAY_SIZE = 52;   // 食材節點顯示大小（px）

// ── LCG 確定性隨機（同 BoarController）────────────────────
// 兩端相同 seed → 相同食材序列，是帶子同步的基礎
function _makeLCG(seed) {
    let s = (seed >>> 0) || 1;
    return function() {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// ROW_Y 共 9 條邊界線（t=0~8），取自 GridSystem
// 平均列高（用於 px/s → t/s 換算）
const TOTAL_H   = GridSystem.ROW_Y[0] - GridSystem.ROW_Y[8]; // ≈460
const AVG_ROW_H = TOTAL_H / 8; // ≈57.5

/**
 * 根據「格子欄 col」與「邊界索引 t」計算世界座標。
 * t=0 → 頂端邊界中心，t=8 → 底端邊界中心
 */
function _beltWorldPos(col, t) {
    t = Math.max(0, Math.min(8, t));
    const r     = Math.floor(t);
    const frac  = t - r;
    const rNext = Math.min(8, r + 1);

    const RY  = GridSystem.ROW_Y;
    const RLX = GridSystem.ROW_LEFT_X;
    const RRX = GridSystem.ROW_RIGHT_X;
    const COLS = GridSystem.COLS;

    // Y：在兩條邊界線之間線性插值
    const y = RY[r] + (RY[rNext] - RY[r]) * frac;

    // X：格子欄中心（寬度隨透視縮放）
    const cw0 = (RRX[r]     - RLX[r])     / COLS;
    const cw1 = (RRX[rNext] - RLX[rNext]) / COLS;
    const x0  = RLX[r]     + col * cw0 + cw0 / 2;
    const x1  = RLX[rNext] + col * cw1 + cw1 / 2;
    const x   = x0 + (x1 - x0) * frac;

    return { x, y };
}

const ConveyorBelt = cc.Class({
    extends: cc.Component,

    statics: { instances: [] },

    properties: {
        beltCol: {
            default: 0,
            type: cc.Integer,
            tooltip: '輸送帶所在格子欄 (0~11)',
        },
        spawnInterval: {
            default: 2.5,
            tooltip: '幾秒生成一個食材',
        },
        itemSpeed: {
            default: 55,
            tooltip: '食材向下移動速度 px/s（螢幕空間）',
        },
    },

    onLoad() {
        ConveyorBelt.instances.push(this);

        this._items       = [];
        this._spawnTimer  = 0;
        this._itemCounter = 0;    // 每條帶子的全域 item 序號（用於多人同步移除）
        this._rng         = null; // 由 initWithSeed() 設定
        this._started     = false;// 等待 seed 後才開始生成

        // 速度換算：px/s → 邊界索引/s
        this._tSpeed = this.itemSpeed / AVG_ROW_H;

        // 生成 / 消亡的 t 值
        this._spawnT   = -0.5;  // 稍微在頂端以上（不突然出現）
        this._destroyT =  8.5;  // 稍微在底端以下

        // 繪製視覺輸送帶
        this._drawBeltVisual();
    },

    onDestroy() {
        const idx = ConveyorBelt.instances.indexOf(this);
        if (idx >= 0) ConveyorBelt.instances.splice(idx, 1);
        this.clearAll();
    },

    /**
     * 以確定性 seed 初始化帶子，多人兩端使用相同 seed 即可同步食材序列。
     * @param {number} globalSeed  BurgerBattleManager 廣播的全域 seed
     */
    initWithSeed(globalSeed) {
        // 每條帶子用 globalSeed + beltCol 作為各自的 LCG seed（兩條帶錯開）
        this._rng         = _makeLCG(globalSeed + this.beltCol);
        this._spawnTimer  = this._rng() * this.spawnInterval; // 確定性初始偏移
        this._itemCounter = 0;
        this._started     = true;
        cc.log(`[Belt col=${this.beltCol}] initWithSeed(${globalSeed}) 完成`);
    },

    update(dt) {
        if (!this._started) return;  // 等 seed

        // 計時生成
        this._spawnTimer += dt;
        if (this._spawnTimer >= this.spawnInterval) {
            this._spawnTimer -= this.spawnInterval;
            this._spawnItem();
        }

        // 移動食材
        for (let i = this._items.length - 1; i >= 0; i--) {
            const item = this._items[i];
            if (!item || !cc.isValid(item)) {
                this._items.splice(i, 1);
                continue;
            }

            // 推進邊界索引
            item._beltT += this._tSpeed * dt;

            if (item._beltT > this._destroyT) {
                item.destroy();
                this._items.splice(i, 1);
                continue;
            }

            // 更新世界座標（跟著透視格子）
            const pos = _beltWorldPos(this.beltCol, item._beltT);
            item.setPosition(pos.x, pos.y);
        }
    },

    // ══════════════════════════════════════════
    //  視覺輸送帶（灰色梯形色塊）
    // ══════════════════════════════════════════

    _drawBeltVisual() {
        const canvas = cc.find('Canvas');
        if (!canvas) return;

        const RY  = GridSystem.ROW_Y;
        const RLX = GridSystem.ROW_LEFT_X;
        const RRX = GridSystem.ROW_RIGHT_X;
        const COLS = GridSystem.COLS;
        const col = this.beltCol;

        // 計算格子欄四個角（上邊界 & 下邊界）
        const cw_top = (RRX[0] - RLX[0]) / COLS;
        const cw_bot = (RRX[8] - RLX[8]) / COLS;

        const tlX = RLX[0] + col * cw_top;          // top-left x
        const trX = tlX + cw_top;                    // top-right x
        const blX = RLX[8] + col * cw_bot;           // bottom-left x
        const brX = blX + cw_bot;                    // bottom-right x
        const topY = RY[0];
        const botY = RY[8];

        // 建立 Graphics 節點
        const gfxNode = new cc.Node(`BeltVisual_col${col}`);
        gfxNode.zIndex = -1;     // 畫在玩家 / 食材之下
        canvas.addChild(gfxNode);

        const gfx = gfxNode.addComponent(cc.Graphics);

        // 灰色帶底色（半透明）
        gfx.fillColor = cc.color(80, 80, 80, 140);
        gfx.moveTo(tlX, topY);
        gfx.lineTo(trX, topY);
        gfx.lineTo(brX, botY);
        gfx.lineTo(blX, botY);
        gfx.close();
        gfx.fill();

        // 邊框
        gfx.strokeColor = cc.color(120, 120, 120, 200);
        gfx.lineWidth   = 2;
        gfx.moveTo(tlX, topY);
        gfx.lineTo(trX, topY);
        gfx.lineTo(brX, botY);
        gfx.lineTo(blX, botY);
        gfx.close();
        gfx.stroke();

        // 頂部「入口」橘色標示
        const arrowNode = new cc.Node(`BeltArrow_col${col}`);
        const arrowGfx  = arrowNode.addComponent(cc.Graphics);
        arrowGfx.fillColor = cc.color(255, 160, 30, 220);
        const midX = (tlX + trX) / 2;
        arrowGfx.moveTo(midX - 14, topY + 18);
        arrowGfx.lineTo(midX + 14, topY + 18);
        arrowGfx.lineTo(midX,      topY + 4);
        arrowGfx.close();
        arrowGfx.fill();
        arrowNode.zIndex = 1;
        canvas.addChild(arrowNode);
    },

    // ══════════════════════════════════════════
    //  食材生成
    // ══════════════════════════════════════════

    _spawnItem() {
        // 用 LCG RNG 確保兩端生成順序一致
        const rng      = this._rng || (() => Math.random());
        const foodType = FOOD_TYPES[Math.floor(rng() * FOOD_TYPES.length)];
        const startPos = _beltWorldPos(this.beltCol, this._spawnT);

        const node = new cc.Node(foodType);
        node.setContentSize(ITEM_DISPLAY_SIZE, ITEM_DISPLAY_SIZE);
        node.setPosition(startPos.x, startPos.y);
        node._foodType = foodType;
        node._beltT    = this._spawnT;
        node._beltIdx  = this._itemCounter++;  // 全域序號，用於多人同步移除

        const sp = node.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        ItemSpriteRegistry.applySpriteFrame(node, foodType);

        const canvas = cc.find('Canvas');
        node.parent = canvas || this.node.parent;
        node.zIndex  = 2;

        this._items.push(node);
        cc.log(`[Belt col=${this.beltCol}] 生成食材: ${foodType} idx=${node._beltIdx}`);
    },

    // ══════════════════════════════════════════
    //  對外 API
    // ══════════════════════════════════════════

    /** 取得距離指定世界座標最近的食材，若無則回傳 null */
    getNearestItem(worldX, worldY, maxDist) {
        let nearest = null;
        let minDist = maxDist;
        for (const item of this._items) {
            if (!item || !cc.isValid(item)) continue;
            const dx = item.x - worldX;
            const dy = item.y - worldY;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) {
                minDist  = d;
                nearest  = item;
            }
        }
        return nearest;
    },

    /** 從帶上移除指定食材節點（玩家拾取後呼叫）*/
    removeItem(node) {
        const idx = this._items.indexOf(node);
        if (idx >= 0) this._items.splice(idx, 1);
    },

    /**
     * 依 beltIdx 移除食材（遠端玩家撿走時，本地同步移除用）
     * @param {number} beltIdx  node._beltIdx 值
     */
    removeItemByIdx(beltIdx) {
        for (let i = this._items.length - 1; i >= 0; i--) {
            const item = this._items[i];
            if (item && item._beltIdx === beltIdx) {
                if (cc.isValid(item)) item.destroy();
                this._items.splice(i, 1);
                cc.log(`[Belt col=${this.beltCol}] 遠端移除 idx=${beltIdx}`);
                return;
            }
        }
    },

    /** 清除帶上所有食材（遊戲結束時用）*/
    clearAll() {
        for (const item of this._items) {
            if (cc.isValid(item)) item.destroy();
        }
        this._items = [];
    },
});

module.exports = ConveyorBelt;
