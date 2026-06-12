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
 *   - 只交最先生成的（id 最小）且該訂單的 recipe 包含此食材的那筆訂單。
 *   - ServingCounter 放入食材時，先鎖定「最舊的、包含此食材的訂單」作為目標，
 *     後續食材只能繼續補同一筆訂單，直到湊齊或放棄。
 */

const EventBus      = require('../core/EventBus');
const GameManager   = require('../core/GameManager');
const AudioManager  = require('../core/AudioManager');

// ── 訂單設定 ──────────────────────────────────────────────
const RECIPES = [
    { recipe: 'hamburger',          timeLimit: 60, reward: 100 },
    { recipe: 'chocolate_toast', timeLimit: 50, reward: 80  },
    { recipe: 'black_tea',       timeLimit: 40, reward: 70  },
    { recipe: 'burger_tea',      timeLimit: 70, reward: 150 },
    { recipe: 'toast_tea',       timeLimit: 60, reward: 120 },
    { recipe: 'burger_toast',    timeLimit: 70, reward: 160 },
    { recipe: 'full_meal',       timeLimit: 90, reward: 250 },
];

// recipe → 所需食材（標準化後的名稱，與 ServingCounter._normalizeItemName 的 value 一致）
const RECIPE_INGREDIENTS = {
    'hamburger': ['hamburger'],
    'chocolate_toast': ['chocolate_toast'],
    'black_tea': ['black_tea'],
    'burger_tea': ['hamburger', 'black_tea'],
    'toast_tea': ['chocolate_toast', 'black_tea'],
    'burger_toast': ['hamburger', 'chocolate_toast'],
    'full_meal': ['hamburger', 'black_tea', 'chocolate_toast'],
};

// recipe → 音效檔案路徑
const RECIPE_SOUNDS = {
    'hamburger':       'audio/burger',
    'chocolate_toast': 'audio/chocolate',
    'black_tea':       'audio/blacktea',
    'burger_tea':      'audio/Burger_tea',
    'toast_tea':       'audio/Toast_Tea',
    'burger_toast':    'audio/burger_toast',
    'full_meal':       'audio/full_meal',
};

const MAX_ACTIVE_ORDERS = 3;   // 同時最多幾筆訂單
const SPAWN_INTERVAL    = 15;  // 每幾秒產生一筆新訂單
const EV_ORDER          = 22;  // Photon 事件碼：訂單同步（added / expired）

// ─────────────────────────────────────────────────────────

const OrderManager = cc.Class({
    extends: cc.Component,

    statics: {
        instance: null,
        // 讓外部可以查一筆 recipe 需要哪些食材（ServingCounter 用）
        getIngredients(recipe) {
            return RECIPE_INGREDIENTS[recipe] || [recipe];
        },
    },

    onLoad() {
        if (OrderManager.instance) {
            this.destroy();
            return;
        }
        OrderManager.instance = this;

        this._orders  = [];
        this._nextId  = 0;
        this._started = false;

        EventBus.on('game:start',    this._onGameStart,    this);
        EventBus.on('game:end',      this._onGameEnd,      this);
        EventBus.on('order:refresh', this._onRefreshOrder, this);

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
        this._isHost = (window._nmRole !== 'guest');
        this.unschedule(this._spawnOrder);

        // 不在這裡 reset _orders。Race 路徑：Guest 在 game:start 之前先收到 Host 的
        // EV_ORDER 'added' 廣播，訂單已 push 進 _orders 並顯示 UI；此時若把 _orders=[]
        // 清掉，Host 之後廣播 'expired' 時 Guest 找不到 id 直接 return，UI 永遠卡住。
        // onLoad 已經把 _orders 設成 []；_onGameEnd 也會清。
        this._started = true;

        cc.log('[OrderManager] 開始產生訂單, isHost=', this._isHost, 'orders.len=', this._orders.length);

        if (this._isHost) {
            this._spawnOrder();
            this.schedule(this._spawnOrder, SPAWN_INTERVAL);
        }
    },

    _onGameEnd() {
        this.unschedule(this._spawnOrder);
        this._orders  = [];
        this._started = false;
    },

    update(dt) {
        if (!this._started || !this._orders.length) return;
        if (!GameManager.instance) return;
        const currentElapsed = GameManager.instance.elapsed;

        for (let i = this._orders.length - 1; i >= 0; i--) {
            const order = this._orders[i];
            if (typeof order.spawnElapsed === 'number') {
                order.timeLeft = Math.max(0, order.timeLimit - (currentElapsed - order.spawnElapsed));
            } else {
                order.timeLeft -= dt;
                if (order.timeLeft < 0) order.timeLeft = 0;
            }

            if (order.timeLeft <= 0) {
                if (this._isHost) {
                    this._orders.splice(i, 1);
                    cc.log('[OrderRemove] path=UPDATE-EXPIRE id=', order.id, 'recipe=', order.recipe);
                    EventBus.emit('order:expired', { id: order.id, recipe: order.recipe });
                    if (window._nm) {
                        window._nm.sendGameEvent(EV_ORDER, { action: 'expired', id: order.id });
                    }
                } else {
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

        const soundFile = RECIPE_SOUNDS[order.recipe];
        if (soundFile) {
            const am = AudioManager.ensure ? AudioManager.ensure() : AudioManager.instance;
            if (am) {
                am.playEffect(soundFile);
            }
        }

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
        if (this._isHost) return;

        const data = msg.data;
        if (data.action === 'added') {
            if (this._orders.some(o => o.id === data.id)) return;
            const timeLimit      = data.timeLimit || data.timeLeft;
            const currentElapsed = GameManager.instance ? GameManager.instance.elapsed : 0;
            const spawnElapsed   = currentElapsed - (timeLimit - data.timeLeft);

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
            // 即使本地 _orders 找不到（race 期間被洗掉、或本地已自行過期），仍要 emit
            // order:expired 通知 OrderContainer 移除 UI；否則訂單卡在畫面上不消失。
            const idx = this._orders.findIndex(o => o.id === data.id);
            let recipe = null;
            if (idx >= 0) {
                const order = this._orders[idx];
                recipe = order.recipe;
                this._orders.splice(idx, 1);
                cc.log('[OrderRemove] path=NET-EXPIRED-FROM-HOST id=', order.id, 'recipe=', order.recipe, 'timeLeft=', order.timeLeft.toFixed(2));
            } else {
                cc.log('[OrderRemove] path=NET-EXPIRED-FROM-HOST id=', data.id, '本地 _orders 找不到，僅通知 UI 移除');
            }
            EventBus.emit('order:expired', { id: data.id, recipe });
        }
    },

    // ── 核心查詢 ──────────────────────────────────────────
    // 找「最先生成（id 最小）且 recipe 包含指定食材」的訂單 index。
    // ingredient 是標準化後的食材名稱（如 'bread'、'black_tea'）。
    _findOldestOrderWithIngredient(ingredient) {
        let bestIdx = -1;
        let minId   = Infinity;
        for (let i = 0; i < this._orders.length; i++) {
            const order       = this._orders[i];
            const ingredients = RECIPE_INGREDIENTS[order.recipe] || [order.recipe];
            if (ingredients.includes(ingredient) && order.id < minId) {
                bestIdx = i;
                minId   = order.id;
            }
        }
        return bestIdx;
    },

    // ServingCounter 用：優先選「recipe 完全等於 itemName」的訂單（成品直接交對應單），
    // 如果沒有，再退回 _findOldestOrderWithIngredient（湊單路徑）。
    // 修這個 bug：之前只看 ingredient 包含，導致 hamburger 成品被舊的 burger_tea 單
    // 截住變成湊單第一步，hamburger 單自己過期，看起來像「時間沒到就被刪」。
    _findBestOrderForItem(itemName) {
        let bestIdx = -1;
        let minId   = Infinity;
        for (let i = 0; i < this._orders.length; i++) {
            const order = this._orders[i];
            if (order.recipe === itemName && order.id < minId) {
                bestIdx = i;
                minId   = order.id;
            }
        }
        if (bestIdx !== -1) return bestIdx;
        return this._findOldestOrderWithIngredient(itemName);
    },

    // 找「能容納指定食材清單作為部分進度」的最舊訂單。
    // ServingCounter 切換 submission 用：玩家中途換主意（先 black_tea 後 chocolate_toast），
    // 用這個找到能同時容納兩者的訂單（例如 toast_tea），把鎖定的訂單從 burger_tea 切過去。
    _findOrderContainingAll(items) {
        let bestIdx = -1;
        let minId   = Infinity;
        for (let i = 0; i < this._orders.length; i++) {
            const order  = this._orders[i];
            const needed = (RECIPE_INGREDIENTS[order.recipe] || [order.recipe]).slice();
            let allFit = true;
            for (const it of items) {
                const idx = needed.indexOf(it);
                if (idx === -1) { allFit = false; break; }
                needed.splice(idx, 1);
            }
            if (allFit && order.id < minId) {
                bestIdx = i;
                minId   = order.id;
            }
        }
        return bestIdx;
    },

    // 直接用 id 查（ServingCounter 鎖定訂單後用）
    getOrderById(id) {
        return this._orders.find(o => o.id === id) || null;
    },

    // ── 技能二：二退 ──────────────────────────────────────
    _onRefreshOrder() {
        if (!this._isHost) return;
        if (!this._orders.length) return;

        const order = this._orders.shift();
        cc.log('[OrderRemove] path=SKILL_2-REFRESH id=', order.id);
        EventBus.emit('order:expired', { id: order.id, recipe: order.recipe });
        if (window._nm) {
            window._nm.sendGameEvent(EV_ORDER, { action: 'expired', id: order.id });
        }

        this._spawnOrder();
    },

    // ── 出餐 API ──────────────────────────────────────────
    // ServingCounter 湊齊後呼叫：移除、加分、廣播 completed。
    consumeOrderById(id) {
        const idx = this._orders.findIndex(o => o.id === id);
        if (idx === -1) return { id, reward: 0, found: false };

        const order = this._orders[idx];
        this._orders.splice(idx, 1);
        cc.log('[OrderRemove] path=SERVE-BY-ID id=', order.id, 'recipe=', order.recipe,
               'timeLeft=', order.timeLeft.toFixed(2));

        EventBus.emit('order:completed', { id: order.id, recipe: order.recipe });
        if (GameManager.instance) {
            GameManager.instance.addScore(order.reward || 100);
        }
        return { id: order.id, reward: order.reward || 100, found: true };
    },

    // 給 GameNetworkBridge._applyRemoteServe 用（遠端出餐，不重複加分）
    consumeOrderByIdRemote(id) {
        const idx = this._orders.findIndex(o => o.id === id);
        if (idx === -1) return { id, reward: 0, found: false };
        const order = this._orders[idx];
        this._orders.splice(idx, 1);
        cc.log('[OrderRemove] path=REMOTE-SERVE-BY-ID id=', order.id, 'recipe=', order.recipe);
        return { id: order.id, reward: order.reward || 100, found: true };
    },

    getOrders() { return (this._orders || []).slice(); },
});

module.exports = OrderManager;
