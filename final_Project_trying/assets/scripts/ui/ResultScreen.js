/**
 * ResultScreen  (cc.Component)
 * 掛在場景中的 ResultScreen 節點上。
 *
 * 預設隱藏，收到 game:end 後顯示最終分數與操作按鈕。
 *
 * Inspector 需綁定：
 *   resultPanel      — cc.Node，整個結算面板（預設 active = false）
 *   finalScoreLabel  — cc.Label，顯示最終分數
 *   replayButton     — cc.Button，再玩一次
 *   menuButton       — cc.Button，回主選單
 *
 * EventBus 監聽：
 *   game:end  { score }
 */

const EventBus = require('../core/EventBus');
const LeaderboardManager = require('../core/LeaderboardManager');

const ResultScreen = cc.Class({
    extends: cc.Component,

    properties: {
        resultPanel: {
            default: null,
            type:    cc.Node,
            tooltip: '整個結算面板，預設 active = false',
        },
        finalScoreLabel: {
            default: null,
            type:    cc.Label,
            tooltip: '顯示最終分數的 Label',
        },
        replayButton: {
            default: null,
            type:    cc.Button,
            tooltip: '再玩一次按鈕',
        },
        menuButton: {
            default: null,
            type:    cc.Button,
            tooltip: '回主選單按鈕',
        },
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        // 預設隱藏結算面板
        if (this.resultPanel) this.resultPanel.active = false;

        cc.log('[ResultScreen] onLoad: replayButton=', !!this.replayButton,
               'menuButton=', !!this.menuButton,
               'resultPanel=', !!this.resultPanel,
               'role=', window._nmRole);

        // 雙保險：同時掛 cc.Button 的 'click' 跟 node 的 TOUCH_END。
        // 'click' 需要 cc.Button.onEnable 已經跑過（要等節點 active in hierarchy），
        // TOUCH_END 是 node 層的低階事件，自己呼叫 node.on(TOUCH_END) 就會把 node
        // 註冊到 EventManager。哪個先 fire 都會走到 handler，handler 內用旗標
        // 防止重複跑 loadScene。
        if (this.replayButton) {
            this.replayButton.node.on('click', this._onReplay, this);
            this.replayButton.node.on(cc.Node.EventType.TOUCH_END, this._onReplay, this);
        }
        if (this.menuButton) {
            this.menuButton.node.on('click', this._onMenu, this);
            this.menuButton.node.on(cc.Node.EventType.TOUCH_END, this._onMenu, this);
        }

        EventBus.on('game:end', this._onGameEnd, this);

        // Guest 訂閱 Host 在結算畫面的選擇，跟著切場景
        if (window._nmRole === 'guest' && window._nm) {
            window._nm.on('host_result_choice', this._onHostChoice, this);
        }
    },

    onDestroy() {
        EventBus.off('game:end', this._onGameEnd, this);

        if (window._nm) {
            window._nm.off('host_result_choice', this._onHostChoice);
        }

        // scene unload 時子節點可能已經被先銷毀，這時 this.replayButton 仍非 null 但
        // .node 已 invalid。要用 cc.isValid 多檢查一層才不會吃 TypeError。
        if (cc.isValid(this.replayButton) && cc.isValid(this.replayButton.node)) {
            this.replayButton.node.off('click', this._onReplay, this);
            this.replayButton.node.off(cc.Node.EventType.TOUCH_END, this._onReplay, this);
        }
        if (cc.isValid(this.menuButton) && cc.isValid(this.menuButton.node)) {
            this.menuButton.node.off('click', this._onMenu, this);
            this.menuButton.node.off(cc.Node.EventType.TOUCH_END, this._onMenu, this);
        }
    },

    // ─────────────────────────────────────────────
    //  game:end
    // ─────────────────────────────────────────────

    _onGameEnd(data) {
        cc.log('[ResultScreen] 遊戲結束，分數:', data.score);

        const isHost = window._nmRole !== 'guest';  // 單機 / null 都當 host

        if (this.finalScoreLabel) {
            let scoreText = '最終分數: ' + data.score;
            if (!isHost) scoreText += '\n等待房主選擇...';
            this.finalScoreLabel.string = scoreText;
        }

        if (this.resultPanel) {
            this.resultPanel.active = true;
            cc.log('[ResultScreen] panel 已 active, role=', window._nmRole);
        }

        // Host 上傳分數到排行榜（只有 Host 上傳，避免重複）
        if (isHost && window._fbUser) {
            this._submitScoreToLeaderboard(data.score);
        }

        // Guest 只看不能按，隱藏按鈕
        if (!isHost) {
            if (this.replayButton && this.replayButton.node) {
                this.replayButton.node.active = false;
            }
            if (this.menuButton && this.menuButton.node) {
                this.menuButton.node.active = false;
            }
        }
    },

    _submitScoreToLeaderboard(score) {
        // 初始化 LeaderboardManager（如果還沒初始化）
        if (!LeaderboardManager._db) {
            LeaderboardManager.init();
        }

        const level = cc.sys.localStorage.getItem('selectedLevel') || 'unknown';
        const playerName = (window._fbUser && window._fbUser.displayName) || '訪客';
        const uid = (window._fbUser && window._fbUser.uid) || 'guest_' + Date.now();

        LeaderboardManager.submitScore({
            playerName: playerName,
            uid: uid,
            score: score,
            level: level,
        }).then(success => {
            if (success) {
                cc.log('[ResultScreen] 分數已上傳到排行榜');
            } else {
                cc.warn('[ResultScreen] 分數上傳失敗');
            }
        });
    },

    // ─────────────────────────────────────────────
    //  按鈕
    // ─────────────────────────────────────────────

    _onReplay() {
        if (this._clicked) return;   // 'click' 跟 TOUCH_END 雙保險可能會 double-fire
        if (window._nmRole === 'guest') return;   // 只有 Host 能按
        this._clicked = true;
        cc.log('[ResultScreen] Host 再玩一次 clicked → 回選關');
        // NetworkManager 的 _gameStarted 從上一局還留著 true，下一次 raiseEvent
        // code 2 會被當成重複觸發直接 ignore，必須先 reset。
        if (window._nm) {
            window._nm._gameStarted = false;
            if (typeof window._nm.sendResultChoice === 'function') {
                window._nm.sendResultChoice('replay');
            }
        }
        EventBus.clear();
        cc.director.loadScene('levelselect');
    },

    _onMenu() {
        if (this._clicked) return;
        if (window._nmRole === 'guest') return;
        this._clicked = true;
        cc.log('[ResultScreen] Host 回主選單 clicked');
        // 先廣播給 Guest，給 raiseEvent 一點時間送出再離開房間 + 切場景
        if (window._nm && typeof window._nm.sendResultChoice === 'function') {
            window._nm.sendResultChoice('menu');
        }
        this.scheduleOnce(() => {
            if (window._nm && typeof window._nm.leaveRoom === 'function') {
                window._nm.leaveRoom();
            }
            EventBus.clear();
            cc.director.loadScene('menu');
        }, 0.3);
    },

    // ─────────────────────────────────────────────
    //  Guest 收到 Host 的選擇
    // ─────────────────────────────────────────────

    _onHostChoice(msg) {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[ResultScreen] Guest 收到 host 選擇:', msg.choice);
        if (msg.choice === 'replay') {
            if (window._nm) window._nm._gameStarted = false;
            EventBus.clear();
            cc.director.loadScene('levelselect');
        } else {
            // menu
            if (window._nm && typeof window._nm.leaveRoom === 'function') {
                window._nm.leaveRoom();
            }
            EventBus.clear();
            cc.director.loadScene('menu');
        }
    },
});

module.exports = ResultScreen;
