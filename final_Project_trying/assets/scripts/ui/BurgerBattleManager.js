/**
 * BurgerBattleManager  (cc.Component 單例)
 * 「漢堡組裝對抗」模式的場景控制器。
 *
 * Phase 1：場景初始化、計時、基本 UI、返回按鈕。
 * Phase 2：組裝台 / 送餐台建立、計分、結算。
 *
 * 掛在 burger_battle.fire 的 Canvas 節點上。
 */

const ConveyorBelt         = require('../core/ConveyorBelt');
const StationBase          = require('../station/StationBase');
const BurgerServingCounter = require('../station/BurgerServingCounter');
const EventBus             = require('../core/EventBus');

// 遊戲原版 table（工作臺）sprite UUID
const TABLE_SPRITE_UUID = 'ee0596e6-9850-46c0-b431-fdd8b21f63b2';

const SCORE_PER_BURGER = 150;

const BurgerBattleManager = cc.Class({
    extends: cc.Component,

    statics: { instance: null },

    properties: {
        totalTime: {
            default: 120,
            type: cc.Integer,
            tooltip: '遊戲秒數',
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
        this._ended    = false;
        this._p1Score  = 0;
        this._p2Score  = 0;

        this._buildBasicUI();
        this._createStations();
        this._seedSent = false;  // 避免重複發 seed

        // 監聽多人事件
        EventBus.on('bb:remote_seed',    this._onRemoteSeed,    this);
        EventBus.on('bb:remote_score',   this._onRemoteScore,   this);
        EventBus.on('bb:remote_end',     this._onRemoteEnd,     this);
        // GNB 確認對方已上線 → Host 可以安全廣播 seed
        EventBus.on('bb:partner_ready',  this._onPartnerReady,  this);
    },

    onDestroy() {
        if (BurgerBattleManager.instance === this) {
            BurgerBattleManager.instance = null;
        }
        EventBus.off('bb:remote_seed',   this._onRemoteSeed,   this);
        EventBus.off('bb:remote_score',  this._onRemoteScore,  this);
        EventBus.off('bb:remote_end',    this._onRemoteEnd,    this);
        EventBus.off('bb:partner_ready', this._onPartnerReady, this);
        for (const belt of ConveyorBelt.instances) {
            if (belt && cc.isValid(belt.node)) belt.clearAll();
        }
    },

    start() {
        this._ensurePlayerAnimationControllers();

        this.scheduleOnce(() => {
            this._started = true;
            this.schedule(this._tick, 1);

            if (!window._nmRole) {
                // ── 單機模式：直接生成 seed ──
                const seed = Math.floor(Math.random() * 0xFFFFFF) + 1;
                this._initBelts(seed);
                cc.log('[BurgerBattle] 單機 seed =', seed);
            }
            // 多人 Host: seed 在 _onPartnerReady() 發（等 GNB 確認對方上線）
            // 多人 Guest: 等 _onRemoteSeed 收到 seed

            cc.log('[BurgerBattle] 計時開始，倒數', this.totalTime, '秒');
        }, 0.5);
    },

    /**
     * GNB 收到對方 player_ready → 確認對方 GNB 已訂閱 game_event → 安全廣播 seed。
     * 這與 game 場景的 EV_GUIDE 機制相同：確認雙方在線才送出同步訊號。
     */
    _onPartnerReady() {
        if (window._nmRole !== 'host') return;  // 只有 Host 負責廣播 seed
        if (this._seedSent) return;             // 防止重複
        this._seedSent = true;

        const seed = Math.floor(Math.random() * 0xFFFFFF) + 1;
        this._initBelts(seed);
        EventBus.emit('bb:local_seed', { seed });
        cc.log('[BurgerBattle] 對方已就緒 → 廣播 seed =', seed);
    },

    /** 以 seed 初始化所有帶子（Host / 單機呼叫） */
    _initBelts(seed) {
        for (const belt of ConveyorBelt.instances) {
            if (belt && cc.isValid(belt.node)) {
                belt.initWithSeed(seed);
            }
        }
    },

    // ── 多人網路事件接收 ───────────────────────────────────────

    /** Guest 收到 Host 廣播的 seed → 初始化帶子 */
    _onRemoteSeed(data) {
        cc.log('[BurgerBattle] Guest 收到 seed =', data.seed);
        this._initBelts(data.seed);
    },

    /** 對方分數更新 → 更新 HUD */
    _onRemoteScore(data) {
        // 只更新對方的分數（自己的由 addScore 管理）
        if (data.playerId === 1) {
            this._p1Score = data.score;
            this._setScoreLabel(1, data.score);
        } else {
            this._p2Score = data.score;
            this._setScoreLabel(2, data.score);
        }
    },

    /** Host 廣播遊戲結束 → Guest 同步跳結算 */
    _onRemoteEnd(data) {
        if (this._ended) return;
        this._ended = true;
        this.unschedule(this._tick);

        window._burgerBattleResult = {
            p1Score: data.p1Score,
            p2Score: data.p2Score,
            winner:  data.winner,
        };
        window._gameScore = Math.max(data.p1Score, data.p2Score);

        this._showResultBanner(data.winner);
        this.scheduleOnce(() => cc.director.loadScene('result'), 1.5);
    },

    /**
     * 程式化補 AnimationController，原理與 game.fire 完全一致：
     *
     * game.fire 的做法：
     *   - Player1 節點尺寸 128×128
     *   - Sprite Frame 預設為 player1_sheet（UUID a4bdfac9）
     *   - AnimationController.start() 讀 window._selectedCharacter
     *     → cc.resources.load('characters/{id}_sheet', cc.Texture2D, cb)
     *     → _buildFrames(tex) 建 8 方向 SpriteFrame
     *
     * 這裡：addComponent 後 onLoad() 立即執行（this._sprite 已設），
     * 再直接呼叫 loadCharacter()，跳過等 start() 的延遲。
     * 沒有選角色時 fallback 用 'character-a'。
     */
    _ensurePlayerAnimationControllers() {
        const AnimCtrl = require('../player/AnimationController');
        const canvas   = this.node;

        for (const child of canvas.children) {
            if (child.name !== 'Player1') continue;

            // 1. 尺寸對齊 game.fire
            child.setContentSize(128, 128);

            // 2. 加 AnimationController（若已存在則直接觸發；若沒有就加）
            let animCtrl = child.getComponent(AnimCtrl);
            if (!animCtrl) {
                animCtrl = child.addComponent(AnimCtrl);
                // addComponent 觸發 onLoad() → this._sprite 已設定好
            }

            // 3. 直接呼叫 loadCharacter（與 game.fire 的 AnimationController.start() 相同邏輯）
            const charId = window._selectedCharacter || 'character-a';
            animCtrl.loadCharacter(charId);
            cc.log('[BurgerBattle] Player 角色載入：', child.name, '→', charId);
        }
    },

    // ══════════════════════════════════════════
    //  計分（供 PlayerController 呼叫）
    // ══════════════════════════════════════════

    /**
     * 加分並更新 HUD。
     * @param {number} playerId  1 or 2
     * @param {number} amount    得分（通常 150）
     */
    addScore(playerId, amount) {
        let newScore;
        if (playerId === 1) {
            this._p1Score += amount;
            newScore = this._p1Score;
            this._setScoreLabel(1, newScore);
        } else {
            this._p2Score += amount;
            newScore = this._p2Score;
            this._setScoreLabel(2, newScore);
        }
        cc.log(`[BurgerBattle] P${playerId} +${amount}，目前 P1=${this._p1Score} P2=${this._p2Score}`);
        // 廣播分數給對方
        EventBus.emit('bb:local_score', { playerId, score: newScore });
    },

    // ══════════════════════════════════════════
    //  計時
    // ══════════════════════════════════════════

    _tick() {
        this._timeLeft -= 1;
        this._updateTimerLabel();
        if (this._timeLeft <= 0 && !this._ended) {
            this.unschedule(this._tick);
            if (window._nmRole === 'guest') {
                // Guest: 停止計時，等 Host 廣播 EV_BB_END
                cc.log('[BurgerBattle] Guest 時間到，等待 Host 廣播結果');
            } else {
                // Host / 單機: 自己結束
                this._onGameEnd();
            }
        }
    },

    _onGameEnd() {
        if (this._ended) return;
        this._ended = true;

        const p1 = this._p1Score;
        const p2 = this._p2Score;
        cc.log(`[BurgerBattle] 遊戲結束 | P1=${p1} P2=${p2}`);

        let winner;
        if      (p1 > p2) winner = 'P1';
        else if (p2 > p1) winner = 'P2';
        else               winner = 'draw';

        window._burgerBattleResult = { p1Score: p1, p2Score: p2, winner };
        window._gameScore = Math.max(p1, p2);

        // 多人：Host 廣播結束給 Guest
        if (window._nmRole === 'host' && window._nm) {
            window._nm.sendGameEvent(33 /* EV_BB_END */, { p1Score: p1, p2Score: p2, winner });
        }

        this._showResultBanner(winner);
        this.scheduleOnce(() => cc.director.loadScene('result'), 1.5);
    },

    // ══════════════════════════════════════════
    //  站台初始化（程式化建立）
    // ══════════════════════════════════════════

    _createStations() {
        const canvas = this.node;

        // ── TABLE 站台（col 4 與 col 5，row 0-5，跳過 row 3 = 送餐台）──
        const TABLE_ROWS = [0, 1, 2, 4, 5];
        const TABLE_COLS = [5, 6];

        for (const col of TABLE_COLS) {
            for (const row of TABLE_ROWS) {
                this._makeTableStation(canvas, col, row);
            }
        }

        // ── 送餐台（col 4 row 3 = P1；col 5 row 3 = P2）──────────────
        const sc1Node = new cc.Node('BurgerCounter_P1');
        const sc1     = sc1Node.addComponent(BurgerServingCounter);
        sc1.ownerId   = 1;
        sc1.gridCol   = 5;
        sc1.gridRow   = 3;
        canvas.addChild(sc1Node);

        const sc2Node = new cc.Node('BurgerCounter_P2');
        const sc2     = sc2Node.addComponent(BurgerServingCounter);
        sc2.ownerId   = 2;
        sc2.gridCol   = 6;
        sc2.gridRow   = 3;
        canvas.addChild(sc2Node);

        cc.log('[BurgerBattle] 站台建立完成（TABLE ×10 + 送餐台 ×2）');
    },

    /** 在 (col, row) 建立一個 TABLE 站台，使用遊戲原版 sprite */
    _makeTableStation(canvas, col, row) {
        const node = new cc.Node(`Table_${col}_${row}`);
        node.zIndex = 2;

        const st           = node.addComponent(StationBase);
        st.stationType     = 'TABLE';
        st.gridCol         = col;
        st.gridRow         = row;
        st.visualScale     = 1.0 + row * 0.02;   // 稍微隨列放大（透視感）
        st.itemScale       = 0.65;
        st.itemOffsetY     = 12;
        canvas.addChild(node);  // 觸發 onLoad → 定位 + 阻擋格子

        // 載入遊戲原版 TABLE sprite（cc.assetManager.loadAny 可靠載入 sub-asset UUID）
        const sp   = node.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        cc.assetManager.loadAny({ uuid: TABLE_SPRITE_UUID }, (err, asset) => {
            if (err || !cc.isValid(node)) return;
            if (asset instanceof cc.SpriteFrame) sp.spriteFrame = asset;
        });
    },

    // ══════════════════════════════════════════
    //  基本 UI
    // ══════════════════════════════════════════

    _buildBasicUI() {
        const W = 1440, H = 720;
        const canvas = this.node;

        // ── 計時器（中上）────────────────────────
        this._timerNode = new cc.Node('Timer');
        const timerLbl  = this._timerNode.addComponent(cc.Label);
        timerLbl.string          = this._fmtTime(this.totalTime);
        timerLbl.fontSize        = 38;
        timerLbl.lineHeight      = 42;
        timerLbl.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        this._timerNode.color    = cc.color(255, 255, 255, 255);
        this._timerNode.setPosition(0, H / 2 - 40);
        canvas.addChild(this._timerNode);

        // ── 返回按鈕（右上）─────────────────────
        const backBtn = new cc.Node('BackBtn');
        backBtn.setContentSize(90, 36);
        backBtn.setPosition(W / 2 - 58, H / 2 - 26);
        backBtn.color = cc.color(190, 70, 70, 220);
        const backBg = backBtn.addComponent(cc.Sprite);
        backBg.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        const backLblNode = new cc.Node('Lbl');
        const backLbl     = backLblNode.addComponent(cc.Label);
        backLbl.string    = '離開';
        backLbl.fontSize  = 18;
        backLblNode.setPosition(0, 0);
        backBtn.addChild(backLblNode);

        backBtn.addComponent(cc.Button);
        backBtn.on(cc.Node.EventType.TOUCH_END, () => {
            cc.director.loadScene('menu');
        }, this);
        canvas.addChild(backBtn);

        // ── P1 分數（左上）──────────────────────
        this._p1ScoreNode = this._mkScoreLabel('P1：0', -W / 2 + 90, H / 2 - 40);
        canvas.addChild(this._p1ScoreNode);

        // ── P2 分數（右上）──────────────────────
        this._p2ScoreNode = this._mkScoreLabel('P2：0',  W / 2 - 90, H / 2 - 40);
        canvas.addChild(this._p2ScoreNode);
    },

    _mkScoreLabel(text, x, y) {
        const node = new cc.Node();
        const lbl  = node.addComponent(cc.Label);
        lbl.string           = text;
        lbl.fontSize         = 30;
        lbl.horizontalAlign  = cc.Label.HorizontalAlign.CENTER;
        node.color = cc.color(255, 220, 60, 255);
        node.setPosition(x, y);
        return node;
    },

    _setScoreLabel(playerId, score) {
        const node = playerId === 1 ? this._p1ScoreNode : this._p2ScoreNode;
        if (!node || !cc.isValid(node)) return;
        const lbl = node.getComponent(cc.Label);
        if (lbl) lbl.string = `P${playerId}：${score}`;
    },

    _updateTimerLabel() {
        if (!this._timerNode || !cc.isValid(this._timerNode)) return;
        const lbl = this._timerNode.getComponent(cc.Label);
        if (lbl) lbl.string = this._fmtTime(this._timeLeft);
    },

    _showResultBanner(winner) {
        const canvas   = this.node;
        const banner   = new cc.Node('ResultBanner');
        const bgGfx    = banner.addComponent(cc.Graphics);
        bgGfx.fillColor = cc.color(0, 0, 0, 180);
        bgGfx.rect(-280, -50, 560, 100);
        bgGfx.fill();
        banner.setPosition(0, 40);

        let text;
        if      (winner === 'P1')   text = `🏆 P1 獲勝！  P1:${this._p1Score}  P2:${this._p2Score}`;
        else if (winner === 'P2')   text = `🏆 P2 獲勝！  P1:${this._p1Score}  P2:${this._p2Score}`;
        else                         text = `⚖ 平局！  P1:${this._p1Score}  P2:${this._p2Score}`;

        const lbl = banner.addComponent(cc.Label);
        lbl.string           = text;
        lbl.fontSize         = 36;
        lbl.horizontalAlign  = cc.Label.HorizontalAlign.CENTER;
        banner.color         = cc.color(255, 240, 100, 255);

        canvas.addChild(banner);
    },

    _fmtTime(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
});

module.exports = BurgerBattleManager;
