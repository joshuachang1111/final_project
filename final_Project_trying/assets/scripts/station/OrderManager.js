/**
 * OrderManager  (cc.Component 單例)
 * 掛在場景中「Managers」節點上。
 *
 * 多人同步：Host 權威。
 *   - Host 端負責 spawn、倒數、過期偵測，並用 EV_ORDER (code 22) 廣播給 Guest。
 *   - Guest 端不自行 spawn / 不發 expired，只接收 Host 的廣播。
 *   - Guest 端也會在 update 跑 timeLeft 倒數（純本地用來決定要移除哪一張同名訂單），
 *     但不會 emit expired，最後實際移除是等 Host 廣播 expired 或是 EV_SERVE。
 *
 * 配對策略：
 *   - completeOrder / consumeOrderById / consumeOrderByRecipe 都改成「剩餘時間最少」
 *     優先。原本用 findIndex（== 最舊 id）會出現「我端了 burger#8 (60s)，但畫面上
 *     burger#5 (10s) 消失」這種 UX bug，因為 findIndex 只看順序不看時間。
 *   - 改成 lowest timeLeft 也比較符合「最急的訂單先被消化」的直覺。
 *
 * 完成 / 出餐的同步走 EV_SERVE（在 GameNetworkBridge），這裡只負責訂單列表與廣播。
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
const EV_ORDER          = 22;  // Photon 事件碼：訂單同步（added / expired）

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
        this._started = false;

        EventBus.on('game:start',    this._onGameStart,       this);
        EventBus.on('game:end',      this._onGameEnd,         this);
        EventBus.on('order:refresh', this._onRefreshOrder,    this);

        // 訂閱 NM 的 game_event 來接收 Host 的訂單廣播。
        // Host 也會綁但會被 _isHost 過濾掉，無害。
        if (window._nm) {
            this._onNetworkOrderEvent = this._onNetworkOrderEvent.bind(this);
            window._nm.on('game_event', this._onNetworkOrderEvent);
        }
    },

    onDestroy() {
        EventBus.off('game:start',    this._onGameStart);
        EventBus.off('game:end',      this._onGameEnd);
        EventBus.off('order:refresh', this._onRefreshOrder);
        if (window._nm && this._onNetworkOrderEvent) {
            window._nm.off('game_event', this._onNetworkOrderEvent);
        }
        if (OrderManager.instance === this) OrderManager.instance = null;
    },

    _onGameStart() {
        // 每場重新評估角色，避免 onLoad 時 _nmRole 還沒設好
        this._isHost = (window._nmRole !== 'guest');

        // Idempotent：unschedule 後再 schedule，防止 game:start 被重複 emit 時雙重排程
        this.unschedule(this._spawnOrder);

        // 已啟動過就不再清空 _orders，避免 race（Guest 收到 code 22 後才收到本地
        // game:start）把已同步的訂單給洗掉
        if (!this._started) {
            this._orders = [];
            this._nextId = 0;
            this._started = true;
        }

        cc.log('[OrderManager] 開始產生訂單, isHost=', this._isHost, 'orders.len=', this._orders.length);

        if (this._isHost) {
            this._spawnOrder();
            this.schedule(this._spawnOrder, SPAWN_INTERVAL);
        }
    },

    _onGameEnd() {
        this.unschedule(this._spawnOrder);
        this._orders = [];
        this._started = false;
    },

    // 兩邊都會跑：
    //   Host: 倒數 → 到 0 emit expired + 廣播
    //   Guest: 倒數 → 到 0 只 clamp，不 emit，不廣播（讓 Host 主導 expire）
    //
    // 計時改用 GameManager.elapsed (wall-clock 已扣掉 pause)，視窗最小化恢復後
    // 訂單剩餘時間自動補上錯過的秒數，跟主時間器一致。
    update(dt) {
        if (!this._started || !this._orders.length) return;
        if (!GameManager.instance) return;
        const currentElapsed = GameManager.instance.elapsed;

        for (let i = this._orders.length - 1; i >= 0; i--) {
            const order = this._orders[i];
            if (typeof order.spawnElapsed === 'number' && typeof order.timeLimit === 'number') {
                order.timeLeft = Math.max(0, order.timeLimit - (currentElapsed - order.spawnElapsed));
            } else {
                // Fallback：沒有 spawnElapsed 的舊訂單
                order.timeLeft -= dt;
                if (order.timeLeft < 0) order.timeLeft = 0;
            }

            if (order.timeLeft <= 0) {
                if (this._isHost) {
                    this._orders.splice(i, 1);
                    cc.log('[OrderRemove] path=UPDATE-EXPIRE id=', order.id, 'recipe=', order.recipe, 'timeLeft=', order.timeLeft.toFixed(2));
                    EventBus.emit('order:expired', { id: order.id, recipe: order.recipe });
                    if (window._nm) {
                        window._nm.sendGameEvent(EV_ORDER, {
                            action: 'expired',
                            id:     order.id,
                        });
                    }
                } else {
                    // Guest：clamp 等 Host 廣播
                    order.timeLeft = 0;
                }
            }
        }
    },

    _spawnOrder() {
        if (!this._isHost) return;
        if (this._orders.length >= MAX_ACTIVE_ORDERS) return;

        const tmpl = RECIPES[Math.floor(Math.random() * RECIPES.length)];
        const spawnElapsed = GameManager.instance ? GameManager.instance.elapsed : 0;
        const order = {
            id:           this._nextId++,
            recipe:       tmpl.recipe,
            timeLimit:    tmpl.timeLimit,
            spawnElapsed: spawnElapsed,
            timeLeft:     tmpl.timeLimit,
            reward:       tmpl.reward,
        };

        this._orders.push(order);

        EventBus.emit('order:added', {
            id:        order.id,
            recipe:    order.recipe,
            timeLeft:  order.timeLeft,
            timeLimit: order.timeLimit,
        });

        if (window._nm) {
            window._nm.sendGameEvent(EV_ORDER, {
                action:    'added',
                id:        order.id,
                recipe:    order.recipe,
                timeLeft:  order.timeLeft,
                timeLimit: order.timeLimit,
                reward:    order.reward,
            });
        }
    },

    _onNetworkOrderEvent(msg) {
        if (!msg || msg.code !== EV_ORDER || !msg.data) return;
        if (this._isHost) return;  // Host 不處理自己的廣播

        const data = msg.data;
        if (data.action === 'added') {
            if (this._orders.some(o => o.id === data.id)) return;
            // 反算 spawnElapsed 對齊 Host 的時間軸：
            // timeLimit - (currentElapsed - spawnElapsed) = data.timeLeft
            // → spawnElapsed = currentElapsed - (timeLimit - data.timeLeft)
            const timeLimit = data.timeLimit || data.timeLeft;
            const currentElapsed = GameManager.instance ? GameManager.instance.elapsed : 0;
            const spawnElapsed = currentElapsed - (timeLimit - data.timeLeft);

            const order = {
                id:           data.id,
                recipe:       data.recipe,
                timeLimit:    timeLimit,
                spawnElapsed: spawnElapsed,
                timeLeft:     data.timeLeft,
                reward:       data.reward || 100,
            };
            this._orders.push(order);
            EventBus.emit('order:added', {
                id:        order.id,
                recipe:    order.recipe,
                timeLeft:  order.timeLeft,
                timeLimit: order.timeLimit,
            });
        } else if (data.action === 'expired') {
            const idx = this._orders.findIndex(o => o.id === data.id);
            if (idx === -1) return;
            const order = this._orders[idx];
            this._orders.splice(idx, 1);
            cc.log('[OrderRemove] path=NET-EXPIRED-FROM-HOST id=', order.id, 'recipe=', order.recipe, 'timeLeft=', order.timeLeft.toFixed(2));
            EventBus.emit('order:expired', { id: order.id, recipe: order.recipe });
        }
    },

    // 內部 helper：在同名 recipe 中挑剩餘時間最少的那筆
    _findMostUrgentIdx(recipe) {
        let idx = -1;
        let minTime = Infinity;
        for (let i = 0; i < this._orders.length; i++) {
            if (this._orders[i].recipe === recipe && this._orders[i].timeLeft < minTime) {
                idx = i;
                minTime = this._orders[i].timeLeft;
            }
        }
        return idx;
    },

    // ── 技能二：二退 ──────────────────────────────────────
    // 只有 Host 執行，移除第一筆訂單並立刻生成新訂單
    _onRefreshOrder() {
        if (!this._isHost) return;
        if (!this._orders.length) return;

        // 移除第一筆（不扣分）
        const order = this._orders.shift();
        cc.log('[OrderRemove] path=SKILL_2-REFRESH id=', order.id, 'recipe=', order.recipe, 'timeLeft=', order.timeLeft.toFixed(2));
        EventBus.emit('order:expired', { id: order.id, recipe: order.recipe });
        if (window._nm) {
            window._nm.sendGameEvent(EV_ORDER, { action: 'expired', id: order.id });
        }

        // 立刻生出新訂單
        this._spawnOrder();
    },

    // 給 ServingCounter（本地玩家出餐）用：挑最急的同名訂單完成、加分、回傳被消掉的 order
    completeOrder(recipe) {
        const idx = this._findMostUrgentIdx(recipe);
        if (idx === -1) return null;

        const order = this._orders[idx];
        this._orders.splice(idx, 1);

        cc.log('[OrderRemove] path=LOCAL-SERVE id=', order.id, 'recipe=', order.recipe, 'timeLeft=', order.timeLeft.toFixed(2));
        EventBus.emit('order:completed', {
            id:     order.id,
            recipe: order.recipe,
        });

        if (GameManager.instance) {
            GameManager.instance.addScore(order.reward || 100);
        }
        return order;
    },

    // 給 GameNetworkBridge._applyRemoteServe 用：對方出餐時直接用 id 移除
    // (避免 race：可能本地 update 已經把該 order 過期掉了，那就 no-op)
    consumeOrderById(id) {
        const idx = this._orders.findIndex(o => o.id === id);
        if (idx === -1) return { id, reward: 0, found: false };
        const order = this._orders[idx];
        this._orders.splice(idx, 1);
        cc.log('[OrderRemove] path=REMOTE-SERVE-BY-ID id=', order.id, 'recipe=', order.recipe, 'timeLeft=', order.timeLeft.toFixed(2));
        return { id: order.id, reward: order.reward || 100, found: true };
    },

    // 舊 API：依 recipe 找最急的並消掉（保留向後相容；新流程都改用 consumeOrderById）
    consumeOrderByRecipe(recipe) {
        const idx = this._findMostUrgentIdx(recipe);
        if (idx === -1) return { id: -1, reward: 0 };
        const order = this._orders[idx];
        this._orders.splice(idx, 1);
        cc.log('[OrderRemove] path=REMOTE-SERVE-BY-RECIPE id=', order.id, 'recipe=', order.recipe, 'timeLeft=', order.timeLeft.toFixed(2));
        return { id: order.id, reward: order.reward || 100 };
    },

    consumeOrder(recipe) {
        return this.consumeOrderByRecipe(recipe).reward;
    },

    getOrders() { return (this._orders || []).slice(); },
});

module.exports = OrderManager;