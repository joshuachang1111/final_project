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

        EventBus.on('game:end', this._onGameEnd, this);
    },

    onDestroy() {
        EventBus.off('game:end', this._onGameEnd, this);

        if (this.replayButton) {
            this.replayButton.node.off(cc.Node.EventType.TOUCH_END, this._onReplay, this);
        }
        if (this.menuButton) {
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

        if (this.resultPanel) this.resultPanel.active = true;

        // 在 panel 顯示後才綁定按鈕，確保節點 active 時才註冊觸控事件
        if (this.replayButton) {
            this.replayButton.node.off(cc.Node.EventType.TOUCH_END, this._onReplay, this); // 防重複
            this.replayButton.node.on(cc.Node.EventType.TOUCH_END, this._onReplay, this);
        }
        if (this.menuButton) {
            this.menuButton.node.off(cc.Node.EventType.TOUCH_END, this._onMenu, this); // 防重複
            this.menuButton.node.on(cc.Node.EventType.TOUCH_END, this._onMenu, this);
        }
    },

    // ─────────────────────────────────────────────
    //  按鈕
    // ─────────────────────────────────────────────

    _onReplay() {
        cc.log('[ResultScreen] 再玩一次');
        EventBus.clear();
        cc.director.loadScene('game');
    },

    _onMenu() {
        cc.log('[ResultScreen] 回主選單');
        EventBus.clear();
        cc.director.loadScene('menu');
    },
});

module.exports = ResultScreen;
