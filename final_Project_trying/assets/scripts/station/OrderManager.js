/**
 * OrderManager  (cc.Component 單例)
 * 掛在場景中「Managers」節點上。
 *
 * 職責：
 *   - 定時產生新訂單，emit 'order:added'
 *   - 每秒倒數各訂單，時間到 emit 'order:expired'
 *   - 提供 completeOrder(recipe) 給 ServingCounter 呼叫
 *     成功配對 emit 'order:completed'，並通知 GameManager 加分
 *
 * EventBus 事件：
 *   emit  'order:added'     { id, recipe, timeLeft, reward }
 *   emit  'order:expired'   { id, recipe }
 *   emit  'order:completed' { id, recipe, score }
 *   on    'game:start'      開始產生訂單
 *   on    'game:end'        停止所有排程
 */

const EventBus    = require('../core/EventBus');
const GameManager = require('../core/GameManager');

// ── 訂單設定 ──────────────────────────────────────────────

const RECIPES = [
    { recipe: 'burger', timeLimit: 60, reward: 100 },
    { recipe: 'salad',  timeLimit: 45, reward:  80 },
    { recipe: 'soup',   timeLimit: 50, reward:  90 },
];

const MAX_ACTIVE_ORDERS = 3;   // 同時最多幾筆訂單
const SPAWN_INTERVAL    = 15;  // 每幾秒產生一筆新訂單

// ─────────────────────────────────────────────────────────

const OrderManager = cc.Class({
    extends: cc.Component,

    statics: {
        instance: null,
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        if (OrderManager.instance) {
            this.destroy();
            return;
        }
        OrderManager.instance = this;

        // [{ id, recipe, timeLeft, reward }]
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

    // ─────────────────────────────────────────────
    //  遊戲生命週期
    // ─────────────────────────────────────────────

    _onGameStart() {
        this._orders = [];
        this._nextId = 0;
        cc.log('[OrderManager] game:start 收到，開始產生訂單');

        // 開局立即產生第一筆訂單
        this._spawnOrder();

        // 之後每 SPAWN_INTERVAL 秒產生一筆
        this.schedule(this._spawnOrder, SPAWN_INTERVAL);

        // 每秒倒數所有訂單
        this.schedule(this._tick, 1);
    },

    _onGameEnd() {
        this.unschedule(this._spawnOrder);
        this.unschedule(this._tick);
        this._orders = [];
    },

    // ─────────────────────────────────────────────
    //  訂單產生
    // ─────────────────────────────────────────────

    _spawnOrder() {
        if (this._orders.length >= MAX_ACTIVE_ORDERS) return;

        const tmpl  = RECIPES[Math.floor(Math.random() * RECIPES.length)];
        const order = {
            id:       this._nextId++,
            recipe:   tmpl.recipe,
            timeLeft: tmpl.timeLimit,
            reward:   tmpl.reward,
        };

        this._orders.push(order);
        cc.log('[OrderManager] order:added — id=' + order.id + ' recipe=' + order.recipe + ' timeLeft=' + order.timeLeft);

        EventBus.emit('order:added', {
            id:       order.id,
            recipe:   order.recipe,
            timeLeft: order.timeLeft,
            reward:   order.reward,
        });
    },

    // ─────────────────────────────────────────────
    //  每秒倒數
    // ─────────────────────────────────────────────

    _tick() {
        // 從後往前遍歷，splice 刪除時不影響索引
        for (let i = this._orders.length - 1; i >= 0; i--) {
            const order = this._orders[i];
            order.timeLeft -= 1;

            if (order.timeLeft <= 0) {
                this._orders.splice(i, 1);
                cc.log('[OrderManager] order:expired — id=' + order.id + ' recipe=' + order.recipe);
                EventBus.emit('order:expired', {
                    id:     order.id,
                    recipe: order.recipe,
                });
            } else {
                EventBus.emit('order:tick', {
                    id:       order.id,
                    timeLeft: order.timeLeft,
                });
            }
        }
    },

    // ─────────────────────────────────────────────
    //  完成訂單（由 ServingCounter 呼叫）
    // ─────────────────────────────────────────────

    /**
     * 用 recipe 名稱配對目前訂單，找到第一筆符合的即完成。
     * @param {string} recipe  食物名稱，需與 RECIPES 中的 recipe 一致
     * @returns {boolean}      是否成功配對
     */
    completeOrder(recipe) {
        const idx = this._orders.findIndex(o => o.recipe === recipe);
        if (idx === -1) {
            cc.log('[OrderManager] completeOrder 失敗，找不到 recipe=' + recipe);
            return false;
        }

        const order = this._orders[idx];
        this._orders.splice(idx, 1);

        cc.log('[OrderManager] order:completed — id=' + order.id + ' recipe=' + order.recipe + ' score=' + order.reward);
        EventBus.emit('order:completed', {
            id:     order.id,
            recipe: order.recipe,
            score:  order.reward,
        });

        if (GameManager.instance) {
            GameManager.instance.addScore(order.reward);
        }

        return true;
    },

    /**
     * Bug 3/4 fix: 遠端同步用。
     * 移除第一筆符合 recipe 的訂單，不加分、不廣播事件。
     * 分數與 order:completed 由 GameNetworkBridge 直接處理。
     * @param {string} recipe
     * @returns {boolean}
     */
    /**
     * 遠端同步用：移除符合 recipe 的訂單，回傳 reward（0 表示找不到）。
     * 不加分、不廣播事件，由 GameNetworkBridge 負責後續處理。
     */
    consumeOrder(recipe) {
        const idx = this._orders.findIndex(o => o.recipe === recipe);
        if (idx === -1) return 0;
        const reward = this._orders[idx].reward;
        this._orders.splice(idx, 1);
        cc.log('[OrderManager] consumeOrder (remote sync) recipe=' + recipe + ' reward=' + reward);
        return reward;
    },

    // ─────────────────────────────────────────────
    //  Getter
    // ─────────────────────────────────────────────

    /** 取得目前訂單的副本（唯讀） */
    getOrders() { return (this._orders || []).slice(); },
});

module.exports = OrderManager;
