/**
 * HUD  (cc.Component)
 * 掛在場景中的 HUD 節點上。
 *
 * 顯示內容：
 *   - 剩餘時間（timerLabel）
 *   - 目前分數（scoreLabel）
 *   - 目前訂單列表（orderContainer，每筆訂單一個 Label 子節點）
 *
 * Inspector 需綁定：
 *   timerLabel      — cc.Label，顯示倒數時間
 *   scoreLabel      — cc.Label，顯示分數
 *   orderContainer  — cc.Node，訂單卡片的父節點
 *
 * EventBus 監聽：
 *   game:start      { timeLeft }
 *   game:tick       { timeLeft }
 *   game:score      { score }
 *   game:end        { score }
 *   order:added     { id, recipe, timeLeft, reward }
 *   order:completed { id, recipe, score }
 *   order:expired   { id, recipe }
 */

const EventBus = require('../core/EventBus');

const HUD = cc.Class({
    extends: cc.Component,

    properties: {
        timerLabel: {
            default:  null,
            type:     cc.Label,
            tooltip:  '顯示剩餘時間的 Label 節點',
        },
        scoreLabel: {
            default:  null,
            type:     cc.Label,
            tooltip:  '顯示分數的 Label 節點',
        },
        orderContainer: {
            default:  null,
            type:     cc.Node,
            tooltip:  '訂單卡片的父節點',
        },
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        EventBus.on('game:start',      this._onGameStart,      this);
        EventBus.on('game:tick',       this._onGameTick,       this);
        EventBus.on('game:score',      this._onGameScore,      this);
        EventBus.on('game:end',        this._onGameEnd,        this);
        // 訂單顯示由 OrderContainer.js 負責，HUD 不再處理訂單 UI
    },

    onDestroy() {
        EventBus.off('game:start',      this._onGameStart);
        EventBus.off('game:tick',       this._onGameTick);
        EventBus.off('game:score',      this._onGameScore);
        EventBus.off('game:end',        this._onGameEnd);
    },

    // ─────────────────────────────────────────────
    //  game 事件
    // ─────────────────────────────────────────────

    _onGameStart(data) {
        this._setTimer(data.timeLeft);
        this._setScore(0);
        cc.log('[HUD] 遊戲開始，時間:', data.timeLeft);
    },

    _onGameTick(data) {
        this._setTimer(data.timeLeft);
    },

    _onGameScore(data) {
        this._setScore(data.score);
    },

    _onGameEnd(data) {
        this._setTimer(0);
        this._setScore(data.score);
        this._clearAllOrders();
        cc.log('[HUD] 遊戲結束，最終分數:', data.score);
    },

    // ─────────────────────────────────────────────
    //  內部工具
    // ─────────────────────────────────────────────

    _setTimer(seconds) {
        if (!this.timerLabel) return;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        this.timerLabel.string = m + ':' + (s < 10 ? '0' : '') + s;
    },

    _setScore(score) {
        if (!this.scoreLabel) return;
        this.scoreLabel.string = '分數: ' + score;
    },
});

module.exports = HUD;
