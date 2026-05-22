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
        // Bug 6 fix: store { node, recipe } instead of bare cc.Node
        // so _onOrderTick can reconstruct the label without fragile string splitting
        this._orderNodes = {};   // id → { node: cc.Node, recipe: string }

        EventBus.on('game:start',      this._onGameStart,      this);
        EventBus.on('game:tick',       this._onGameTick,       this);
        EventBus.on('order:tick',      this._onOrderTick,      this);
        EventBus.on('game:score',      this._onGameScore,      this);
        EventBus.on('game:end',        this._onGameEnd,        this);
        EventBus.on('order:added',     this._onOrderAdded,     this);
        EventBus.on('order:completed', this._onOrderCompleted, this);
        EventBus.on('order:expired',   this._onOrderExpired,   this);
    },

    onDestroy() {
        EventBus.off('game:start',      this._onGameStart);
        EventBus.off('game:tick',       this._onGameTick);
        EventBus.off('game:score',      this._onGameScore);
        EventBus.off('game:end',        this._onGameEnd);
        EventBus.off('order:added',     this._onOrderAdded);
        EventBus.off('order:tick',      this._onOrderTick);
        EventBus.off('order:completed', this._onOrderCompleted);
        EventBus.off('order:expired',   this._onOrderExpired);
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
    //  order 事件
    // ─────────────────────────────────────────────

    _onOrderAdded(data) {
        if (!this.orderContainer) return;

        // 建立一個 Label 節點代表這筆訂單
        const card  = new cc.Node('order_' + data.id);
        const label = card.addComponent(cc.Label);
        label.string   = data.recipe + '  ' + data.timeLeft + 's';
        label.fontSize = 20;
        card.color     = cc.Color.WHITE;

        this.orderContainer.addChild(card);
        // Bug 6 fix: store recipe alongside node for safe label reconstruction
        this._orderNodes[data.id] = { node: card, recipe: data.recipe };

        cc.log('[HUD] 訂單新增:', data.recipe, 'id=' + data.id);
    },

    _onOrderCompleted(data) {
        cc.log('[HUD] 訂單完成:', data.recipe, 'id=' + data.id);
        this._removeOrderCard(data.id);
    },

    _onOrderExpired(data) {
        cc.log('[HUD] 訂單過期:', data.recipe, 'id=' + data.id);
        this._removeOrderCard(data.id);
    },

    _onOrderTick(data) {
        const entry = this._orderNodes[data.id];
        if (!entry) return;
        const label = entry.node.getComponent(cc.Label);
        // Bug 6 fix: reconstruct from stored recipe instead of splitting string
        if (label) {
            label.string = entry.recipe + '  ' + data.timeLeft + 's';
        }
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

    _removeOrderCard(id) {
        const entry = this._orderNodes[id];
        if (entry) {
            entry.node.destroy();
            delete this._orderNodes[id];
        }
    },

    _clearAllOrders() {
        Object.keys(this._orderNodes).forEach(id => {
            const entry = this._orderNodes[id];
            if (entry) entry.node.destroy();
        });
        this._orderNodes = {};
    },
});

module.exports = HUD;
