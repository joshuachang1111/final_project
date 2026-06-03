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
               'resultPanel=', !!this.resultPanel);

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
    },

    onDestroy() {
        EventBus.off('game:end', this._onGameEnd, this);

        if (this.replayButton) {
            this.replayButton.node.off('click', this._onReplay, this);
            this.replayButton.node.off(cc.Node.EventType.TOUCH_END, this._onReplay, this);
        }
        if (this.menuButton) {
            this.menuButton.node.off('click', this._onMenu, this);
            this.menuButton.node.off(cc.Node.EventType.TOUCH_END, this._onMenu, this);
        }
    },

    // ─────────────────────────────────────────────
    //  game:end
    // ─────────────────────────────────────────────

    _onGameEnd(data) {
        cc.log('[ResultScreen] 遊戲結束，分數:', data.score);

        if (this.finalScoreLabel) {
            this.finalScoreLabel.string = '最終分數: ' + data.score;
        }

        if (this.resultPanel) {
            this.resultPanel.active = true;
            cc.log('[ResultScreen] panel 已 active, replayButton.enabledInHierarchy=',
                   this.replayButton && this.replayButton.enabledInHierarchy,
                   'menuButton.enabledInHierarchy=',
                   this.menuButton && this.menuButton.enabledInHierarchy);
        }
    },

    // ─────────────────────────────────────────────
    //  按鈕
    // ─────────────────────────────────────────────

    _onReplay() {
        if (this._clicked) return;   // 'click' 跟 TOUCH_END 雙保險可能會 double-fire
        this._clicked = true;
        cc.log('[ResultScreen] 再玩一次 clicked');
        // NetworkManager 的 _gameStarted 從上一局還留著 true，下一次 raiseEvent
        // code 2 會被當成重複觸發直接 ignore，必須先 reset。
        if (window._nm) window._nm._gameStarted = false;
        EventBus.clear();
        cc.director.loadScene('game');
    },

    _onMenu() {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[ResultScreen] 回主選單 clicked');
        // 多人模式：回到菜單的等待房間頁面（保持房間）
        // 單人模式：直接回菜單
        const inMultiplayer = window._nm && window._nmRoomCode;
        if (inMultiplayer) {
            // 多人模式：重置遊戲狀態，回到 menu 場景的等待房間
            if (window._nm) window._nm._gameStarted = false;
            EventBus.clear();
            cc.director.loadScene('menu');
        } else {
            // 單人模式：完全退出，回菜單
            if (window._nm && typeof window._nm.leaveRoom === 'function') {
                window._nm.leaveRoom();
            }
            EventBus.clear();
            cc.director.loadScene('menu');
        }
    },
});

module.exports = ResultScreen;
