/**
 * BurgerStation  (cc.Component)
 * 「漢堡組裝台」— 玩家把食材依序放上來，累積完成一個漢堡。
 *
 * 由 BurgerBattleManager.onLoad() 程式化建立，不掛在 .fire 裡。
 *
 * 配方：bread → meat → onion → tomato（4 步，完成後可取走漢堡）
 * 互動方式：PlayerController 判斷「玩家當前 grid col 是否等於 stationCol」
 * 視覺：cc.Graphics 畫桌面 + 進度點 + 下一步提示
 */

const GridSystem = require('../core/GridSystem');

// 漢堡配方（嚴格依序）
const BURGER_RECIPE = ['bread', 'meat', 'onion', 'tomato'];

// 食材對應顏色（進度圓點用）
const FOOD_COLORS = {
    bread:  cc.color(255, 220, 100, 255),
    meat:   cc.color(180,  70,  40, 255),
    onion:  cc.color(160, 200, 100, 255),
    tomato: cc.color(220,  60,  60, 255),
};

const BurgerStation = cc.Class({
    extends: cc.Component,

    statics: {
        instances: [],
        RECIPE: BURGER_RECIPE,   // 對外暴露，方便除錯
    },

    properties: {
        ownerId:    { default: 1, type: cc.Integer, tooltip: '1=P1, 2=P2' },
        stationCol: { default: 4, type: cc.Integer, tooltip: 'Grid col (0-11)' },
    },

    onLoad() {
        BurgerStation.instances.push(this);
        this._placed    = [];     // 已放上的食材名稱陣列
        this._completed = false;  // 漢堡是否已完成（可取走）

        // 定位在欄位 row=1（整欄最上方區塊）
        const pos = GridSystem.toWorld(this.stationCol, 1);
        this.node.setPosition(pos.x, pos.y);
        this.node.zIndex = 3;

        this._buildVisual();
    },

    onDestroy() {
        const idx = BurgerStation.instances.indexOf(this);
        if (idx >= 0) BurgerStation.instances.splice(idx, 1);
    },

    // ══════════════════════════════════════════
    //  對外互動 API
    // ══════════════════════════════════════════

    /**
     * 玩家嘗試放一個食材。
     * @param {string} foodType
     * @returns {boolean} true = 成功放置
     */
    tryPlaceIngredient(foodType) {
        if (this._completed) return false;
        if (this._placed.length >= BURGER_RECIPE.length) return false;

        const expected = BURGER_RECIPE[this._placed.length];
        if (foodType !== expected) {
            cc.log(`[BurgerStation P${this.ownerId}] 需要 ${expected}，得到 ${foodType} → 拒絕`);
            return false;
        }

        this._placed.push(foodType);
        cc.log(`[BurgerStation P${this.ownerId}] 放置 ${foodType} (${this._placed.length}/${BURGER_RECIPE.length})`);

        if (this._placed.length >= BURGER_RECIPE.length) {
            this._completed = true;
            cc.log(`[BurgerStation P${this.ownerId}] 漢堡完成！`);
        }

        this._refreshVisual();
        return true;
    },

    /**
     * 取走完成的漢堡。
     * 回傳代表漢堡的 cc.Node，或 null（未完成）。
     */
    takeCompletedBurger() {
        if (!this._completed) return null;

        // 建立漢堡節點（載入 hamburger.png）
        const burgerNode = new cc.Node('burger_complete');
        burgerNode.setContentSize(52, 52);
        burgerNode._foodType = 'burger_complete';

        const sp = burgerNode.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        cc.resources.load('food/hamburger', cc.Texture2D, (err, tex) => {
            if (err || !tex || !cc.isValid(burgerNode)) return;
            sp.spriteFrame = new cc.SpriteFrame(tex);
        });

        // 重置台面
        this._placed    = [];
        this._completed = false;
        this._refreshVisual();

        return burgerNode;
    },

    isCompleted()  { return this._completed; },
    stationColVal(){ return this.stationCol; },

    // 下一步需要什麼食材
    nextNeeded() {
        if (this._completed) return null;
        return BURGER_RECIPE[this._placed.length] || null;
    },

    // ══════════════════════════════════════════
    //  視覺
    // ══════════════════════════════════════════

    _buildVisual() {
        // 桌面背景
        this._gfxNode = new cc.Node('StationBG');
        const gfx = this._gfxNode.addComponent(cc.Graphics);
        gfx.fillColor = cc.color(110, 75, 35, 210);
        gfx.rect(-34, -26, 68, 52);
        gfx.fill();
        gfx.strokeColor = cc.color(80, 50, 20, 255);
        gfx.lineWidth = 2;
        gfx.rect(-34, -26, 68, 52);
        gfx.stroke();
        this.node.addChild(this._gfxNode);

        // 玩家標示
        const ownerNode = new cc.Node('OwnerLbl');
        const ownerLbl  = ownerNode.addComponent(cc.Label);
        ownerLbl.string            = `P${this.ownerId}組裝台`;
        ownerLbl.fontSize          = 13;
        ownerLbl.horizontalAlign   = cc.Label.HorizontalAlign.CENTER;
        ownerNode.color            = cc.color(255, 240, 180, 255);
        ownerNode.setPosition(0, 34);
        this.node.addChild(ownerNode);

        // 進度區（動態，由 _refreshVisual 重繪）
        this._progressRoot = new cc.Node('Progress');
        this.node.addChild(this._progressRoot);

        this._refreshVisual();
    },

    _refreshVisual() {
        if (!this._progressRoot || !cc.isValid(this._progressRoot)) return;
        this._progressRoot.removeAllChildren();

        if (this._completed) {
            // 完成標示
            const doneNode = new cc.Node('Done');
            const doneLbl  = doneNode.addComponent(cc.Label);
            doneLbl.string           = '✓ 完成！';
            doneLbl.fontSize         = 16;
            doneLbl.horizontalAlign  = cc.Label.HorizontalAlign.CENTER;
            doneNode.color           = cc.color(80, 255, 80, 255);
            doneNode.setPosition(0, 4);
            this._progressRoot.addChild(doneNode);

            const hintNode = new cc.Node('Hint');
            const hintLbl  = hintNode.addComponent(cc.Label);
            hintLbl.string           = '按F取走漢堡';
            hintLbl.fontSize         = 12;
            hintLbl.horizontalAlign  = cc.Label.HorizontalAlign.CENTER;
            hintNode.color           = cc.color(200, 255, 200, 255);
            hintNode.setPosition(0, -12);
            this._progressRoot.addChild(hintNode);
            return;
        }

        // 進度圓點（每個食材一個）
        const n       = BURGER_RECIPE.length;
        const dotR    = 6;
        const gap     = 16;
        const startX  = -(n - 1) * gap / 2;

        for (let i = 0; i < n; i++) {
            const dot = new cc.Node(`dot${i}`);
            const g   = dot.addComponent(cc.Graphics);

            if (i < this._placed.length) {
                g.fillColor = FOOD_COLORS[BURGER_RECIPE[i]] || cc.color(180, 180, 180);
            } else {
                g.fillColor = cc.color(50, 50, 50, 180);
            }
            g.circle(0, 0, dotR);
            g.fill();

            // 下一個要放的：黃色外框
            if (i === this._placed.length) {
                g.strokeColor = cc.color(255, 240, 50, 255);
                g.lineWidth   = 2;
                g.circle(0, 0, dotR);
                g.stroke();
            }

            dot.setPosition(startX + i * gap, 2);
            this._progressRoot.addChild(dot);
        }

        // 提示文字：下一步需要什麼
        if (this._placed.length < n) {
            const next     = BURGER_RECIPE[this._placed.length];
            const hintNode = new cc.Node('NextHint');
            const hintLbl  = hintNode.addComponent(cc.Label);
            hintLbl.string           = `需要: ${next}`;
            hintLbl.fontSize         = 12;
            hintLbl.horizontalAlign  = cc.Label.HorizontalAlign.CENTER;
            hintNode.color           = cc.color(255, 230, 140, 255);
            hintNode.setPosition(0, -16);
            this._progressRoot.addChild(hintNode);
        }
    },
});

module.exports = BurgerStation;
