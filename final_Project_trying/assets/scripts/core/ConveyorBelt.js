/**
 * ConveyorBelt  (cc.Component)
 * 輸送帶：定時在頂部生成食材節點，食材向下移動，到底部消失（或撞到垃圾桶）
 *
 * Phase 1：食材生成 + 移動 + 消失（不含拾取互動）
 *
 * Properties（Inspector 設定）：
 *   beltCol      : 輸送帶所在的 grid 欄（0-11）
 *   spawnInterval: 幾秒生成一個食材
 *   itemSpeed    : 食材移動速度 px/s
 */

const GridSystem = require('./GridSystem');

const FOOD_TYPES = ['bread', 'meat', 'onion_sliced', 'tomato_sliced'];
const ITEM_DISPLAY_SIZE = 48;   // 食材節點顯示大小（px）

const ConveyorBelt = cc.Class({
    extends: cc.Component,

    statics: { instances: [] },

    properties: {
        beltCol: {
            default: 1,
            type: cc.Integer,
            tooltip: '輸送帶所在格子欄 (0~11)',
        },
        spawnInterval: {
            default: 2.5,
            tooltip: '幾秒生成一個食材',
        },
        itemSpeed: {
            default: 55,
            tooltip: '食材向下移動速度 px/s',
        },
    },

    onLoad() {
        ConveyorBelt.instances.push(this);

        this._items      = [];   // 目前在帶上的食材節點
        this._spawnTimer = 0;

        // 計算上下邊界（從 GridSystem 取世界座標）
        const topPos    = GridSystem.toWorld(this.beltCol, 0);
        const bottomPos = GridSystem.toWorld(this.beltCol, 7);
        this._spawnY    = topPos.y + 40;    // 在 row0 上方生成
        this._destroyY  = bottomPos.y - 40; // 到 row7 下方銷毀

        // 取輸送帶 X 位置（中心）
        this._beltX = topPos.x;
    },

    onDestroy() {
        const idx = ConveyorBelt.instances.indexOf(this);
        if (idx >= 0) ConveyorBelt.instances.splice(idx, 1);
        this.clearAll();
    },

    update(dt) {
        // 計時生成
        this._spawnTimer += dt;
        if (this._spawnTimer >= this.spawnInterval) {
            this._spawnTimer = 0;
            this._spawnItem();
        }

        // 移動食材，到底就刪除
        for (let i = this._items.length - 1; i >= 0; i--) {
            const item = this._items[i];
            if (!item || !cc.isValid(item)) {
                this._items.splice(i, 1);
                continue;
            }
            item.y -= this.itemSpeed * dt;

            if (item.y < this._destroyY) {
                item.destroy();
                this._items.splice(i, 1);
            }
        }
    },

    // ══════════════════════════════════════════
    //  食材生成
    // ══════════════════════════════════════════

    _spawnItem() {
        const foodType = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];

        const node = new cc.Node(foodType);
        node.setContentSize(ITEM_DISPLAY_SIZE, ITEM_DISPLAY_SIZE);
        node.setPosition(this._beltX, this._spawnY);
        node._foodType = foodType;   // 拾取時識別食材種類

        const sp = node.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        cc.resources.load(`food/${foodType}`, cc.Texture2D, (err, tex) => {
            if (err || !tex || !cc.isValid(node)) return;
            sp.spriteFrame = new cc.SpriteFrame(tex);
        });

        // 掛在 Canvas 下，保持和 Player 一致的座標系
        const canvas = cc.find('Canvas');
        node.parent = canvas || this.node.parent;

        this._items.push(node);
        cc.log(`[Belt col=${this.beltCol}] 生成食材: ${foodType}`);
    },

    // ══════════════════════════════════════════
    //  對外 API
    // ══════════════════════════════════════════

    /** 取得距離指定世界座標最近的食材（未被拾取），若無則回傳 null */
    getNearestItem(worldX, worldY, maxDist) {
        let nearest = null;
        let minDist = maxDist;
        for (const item of this._items) {
            if (!item || !cc.isValid(item)) continue;
            const dx = item.x - worldX;
            const dy = item.y - worldY;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) {
                minDist = d;
                nearest = item;
            }
        }
        return nearest;
    },

    /** 從帶上移除指定食材節點（玩家拾取後呼叫）*/
    removeItem(node) {
        const idx = this._items.indexOf(node);
        if (idx >= 0) this._items.splice(idx, 1);
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
