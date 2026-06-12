/**
 * BurgerBattleManager  (cc.Component 單例)
 * 「漢堡組裝對抗」模式的場景控制器。
 * Phase 1：場景初始化、基本 UI、返回按鈕。
 * Phase 2：計分、組裝邏輯、多人同步。
 *
 * 掛在 burger_battle.fire 的 BurgerBattleManager 節點上。
 */

const ConveyorBelt = require('../core/ConveyorBelt');

const BurgerBattleManager = cc.Class({
    extends: cc.Component,

    statics: { instance: null },

    properties: {
        /** 遊戲秒數（從 Inspector 設定，預設 120 秒）*/
        totalTime: {
            default: 120,
            type: cc.Integer,
        },
    },

    onLoad() {
        if (BurgerBattleManager.instance) {
            this.destroy();
            return;
        }
        BurgerBattleManager.instance = this;

        this._timeLeft = this.totalTime;
        this._started  = false;

        this._buildBasicUI();
    },

    onDestroy() {
        if (BurgerBattleManager.instance === this) {
            BurgerBattleManager.instance = null;
        }
        // 清除所有輸送帶上的食材
        for (const belt of ConveyorBelt.instances) {
            if (belt && cc.isValid(belt.node)) belt.clearAll();
        }
    },

    start() {
        // 延遲一幀確保場景初始化完成
        this.scheduleOnce(() => {
            this._started = true;
            this.schedule(this._tick, 1);
            cc.log('[BurgerBattle] 遊戲開始，倒數', this.totalTime, '秒');
        }, 0.5);
    },

    // ══════════════════════════════════════════
    //  計時
    // ══════════════════════════════════════════

    _tick() {
        this._timeLeft -= 1;
        this._updateTimerLabel();

        if (this._timeLeft <= 0) {
            this.unschedule(this._tick);
            this._onGameEnd();
        }
    },

    _onGameEnd() {
        cc.log('[BurgerBattle] 遊戲結束');
        // Phase 2：跳到結算畫面
        this.scheduleOnce(() => {
            cc.director.loadScene('menu');  // 暫時回 menu，Phase 2 換成結算場景
        }, 1.5);
    },

    // ══════════════════════════════════════════
    //  基本 UI（Phase 1 簡易版）
    // ══════════════════════════════════════════

    _buildBasicUI() {
        const W = 1440, H = 720;
        const canvas = this.node;

        // 計時器（中上）
        this._timerNode = new cc.Node('Timer');
        const timerLbl  = this._timerNode.addComponent(cc.Label);
        timerLbl.string          = this._fmtTime(this.totalTime);
        timerLbl.fontSize        = 36;
        timerLbl.lineHeight      = 40;
        timerLbl.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        this._timerNode.color    = cc.color(255, 255, 255, 255);
        this._timerNode.setPosition(0, H / 2 - 40);
        canvas.addChild(this._timerNode);

        // 返回按鈕（右上）
        const backBtn = new cc.Node('BackBtn');
        backBtn.setContentSize(100, 40);
        backBtn.setPosition(W / 2 - 70, H / 2 - 30);
        const backSp = backBtn.addComponent(cc.Sprite);
        backSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        backBtn.color = cc.color(200, 80, 80, 220);
        const backLbl = new cc.Node('label');
        const lbl = backLbl.addComponent(cc.Label);
        lbl.string   = '離開';
        lbl.fontSize = 20;
        backLbl.setPosition(0, 0);
        backBtn.addChild(backLbl);
        backBtn.addComponent(cc.Button);
        backBtn.on(cc.Node.EventType.TOUCH_END, () => {
            cc.director.loadScene('menu');
        }, this);
        canvas.addChild(backBtn);

        // P1 分數（左上）—— Phase 2 會顯示實際分數
        this._p1ScoreNode = this._mkScoreLabel('P1：0', -W / 2 + 80, H / 2 - 40);
        canvas.addChild(this._p1ScoreNode);

        // P2 分數（右上）
        this._p2ScoreNode = this._mkScoreLabel('P2：0', W / 2 - 80, H / 2 - 40);
        canvas.addChild(this._p2ScoreNode);
    },

    _mkScoreLabel(text, x, y) {
        const node = new cc.Node();
        const lbl  = node.addComponent(cc.Label);
        lbl.string          = text;
        lbl.fontSize        = 28;
        lbl.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        node.color = cc.color(255, 220, 60, 255);
        node.setPosition(x, y);
        return node;
    },

    _updateTimerLabel() {
        if (!this._timerNode || !cc.isValid(this._timerNode)) return;
        const lbl = this._timerNode.getComponent(cc.Label);
        if (lbl) lbl.string = this._fmtTime(this._timeLeft);
    },

    _fmtTime(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
});

module.exports = BurgerBattleManager;
