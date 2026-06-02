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

        // 用 cc.Button 的 'click' 事件（cc.Button 內部處理完 TOUCH_END 後 emit 出來），
        // 直接在 onLoad 註冊就好，listener 會跟著節點存活，不會因為 panel 一開始是
        // inactive 而失效。原本用 TOUCH_END + 等 game:end 才綁，會跟 cc.Button 自己
        // 註冊的 TOUCH_END 處理順序打架，常常按了沒反應。
        if (this.replayButton) {
            this.replayButton.node.on('click', this._onReplay, this);
        }
        if (this.menuButton) {
            this.menuButton.node.on('click', this._onMenu, this);
        }

        EventBus.on('game:end', this._onGameEnd, this);
    },

    onDestroy() {
        EventBus.off('game:end', this._onGameEnd, this);

        if (this.replayButton) {
            this.replayButton.node.off('click', this._onReplay, this);
        }
        if (this.menuButton) {
            this.menuButton.node.off('click', this._onMenu, this);
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

        if (this.resultPanel) this.resultPanel.active = true;
    },

    // ─────────────────────────────────────────────
    //  按鈕
    // ─────────────────────────────────────────────

    _onReplay() {
        cc.log('[ResultScreen] 再玩一次');
        // NetworkManager 的 _gameStarted 從上一局還留著 true，下一次 raiseEvent
        // code 2 會被當成重複觸發直接 ignore，必須先 reset。
        if (window._nm) window._nm._gameStarted = false;
        EventBus.clear();
        cc.director.loadScene('game');
    },

    _onMenu() {
        cc.log('[ResultScreen] 回主選單');
        // 回主選單前先離開 Photon 房間，否則 NM 還掛在原本房裡，
        // 下次想建房 / 加入會出怪事。
        if (window._nm && typeof window._nm.leaveRoom === 'function') {
            window._nm.leaveRoom();
        }
        EventBus.clear();
        cc.director.loadScene('menu');
    },
});

module.exports = ResultScreen;
