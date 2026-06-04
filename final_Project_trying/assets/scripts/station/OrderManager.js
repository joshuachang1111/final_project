/**
 * OrderManager  (cc.Component 單例)
 * 掛在場景中「Managers」節點上。
 */

const EventBus    = require('../core/EventBus');
const GameManager = require('../core/GameManager');

// ── 訂單設定 ──────────────────────────────────────────────
const RECIPES = [
    { recipe: 'burger',          timeLimit: 60, reward: 100 },
    { recipe: 'chocolate_toast', timeLimit: 50, reward: 80 },
    { recipe: 'black_tea',       timeLimit: 40, reward: 70 },
    { recipe: 'burger_tea',      timeLimit: 70, reward: 150 },
    { recipe: 'toast_tea',       timeLimit: 60, reward: 120 },
    { recipe: 'burger_toast',    timeLimit: 70, reward: 160 },
    { recipe: 'full_meal',       timeLimit: 90, reward: 250 },
];

const MAX_ACTIVE_ORDERS = 3;   // 同時最多幾筆訂單
const SPAWN_INTERVAL    = 15;  // 每幾秒產生一筆新訂單

// ─────────────────────────────────────────────────────────

const OrderManager = cc.Class({
    extends: cc.Component,

    statics: {
        instance: null,
    },

    onLoad() {
        if (OrderManager.instance) {
            this.destroy();
            return;
        }
        OrderManager.instance = this;

        this._orders = [];
        this._nextId = 0;

        EventBus.on('game:start', this._onGameStart, this);
        EventBus.on('game:end',   this._onGameEnd,   this);
    },

    onDestroy() {
        EventBus.off('game:start', this._onGameStart);
        EventBus.off('game:end',   this._onGameEnd);
        if (OrderManager.instance === this) OrderManager.instance = null;
    },

    _onGameStart() {
        this._orders = [];
        this._nextId = 0;
        cc.log('[OrderManager] 開始產生訂單');

        this._spawnOrder();
        this.schedule(this._spawnOrder, SPAWN_INTERVAL);
    },

    _onGameEnd() {
        this.unschedule(this._spawnOrder);
        this._orders = [];
    },

    _spawnOrder() {
        if (this._orders.length >= MAX_ACTIVE_ORDERS) return;

        const tmpl = RECIPES[Math.floor(Math.random() * RECIPES.length)];
        const order = {
            id:       this._nextId++,
            recipe:   tmpl.recipe,
            timeLeft: tmpl.timeLimit,
        };

        this._orders.push(order);

        EventBus.emit('order:added', {
            id:       order.id,
            recipe:   order.recipe,
            timeLeft: order.timeLeft,
        });
    },

    completeOrder(recipe) {
        const idx = this._orders.findIndex(o => o.recipe === recipe);
        if (idx === -1) return false;

        const order = this._orders[idx];
        this._orders.splice(idx, 1);

        EventBus.emit('order:completed', {
            id:     order.id,
            recipe: order.recipe,
        });

        if (GameManager.instance) {
            GameManager.instance.addScore(order.reward || 100);
        }

        return true;
    },

    consumeOrder(recipe) {
        const idx = this._orders.findIndex(o => o.recipe === recipe);
        if (idx === -1) return 0;
        const reward = this._orders[idx].reward || 100;
        this._orders.splice(idx, 1);
        return reward;
    },

    getOrders() { return (this._orders || []).slice(); },
});

module.exports = OrderManager;