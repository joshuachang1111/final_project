const EventBus    = require('./EventBus');
const GameManager = require('./GameManager');

// ── Photon event codes ────────────────────────────────────
const EV_MOVE    = 10;   // 玩家移動
const EV_STATION = 11;   // 站台互動（pickup / place）
const EV_SERVE   = 12;   // 出餐成功（用於同步分數與訂單移除，避免雙重計分）

cc.Class({
    extends: cc.Component,

    onLoad() {
        const role = window._nmRole || 'host';
        this._localId  = role === 'host' ? 1 : 2;
        this._remoteId = role === 'host' ? 2 : 1;
        cc.log('GameNetworkBridge: role =', role, ', localId =', this._localId);

        // Bug 5 fix (from previous): store all callbacks so onDestroy can remove them
        this._onLocalMove    = this._handleLocalMove.bind(this);
        this._onLocalPickup  = this._handleLocalPickup.bind(this);
        this._onLocalPlace   = this._handleLocalPlace.bind(this);
        this._onLocalServe   = this._handleLocalServe.bind(this);
        this._onGameEvent    = (msg) => this._applyRemoteEvent(msg);

        EventBus.on('player:moved',    this._onLocalMove,   this);
        EventBus.on('station:pickup',  this._onLocalPickup, this);
        EventBus.on('station:place',   this._onLocalPlace,  this);
        EventBus.on('station:serve',   this._onLocalServe,  this);

        if (window._nm) {
            window._nm.on('game_event', this._onGameEvent);
        }

        // Bug 4 (original): delay one frame so all onLoad() calls finish before starting
        this.scheduleOnce(() => {
            if (GameManager.instance) {
                GameManager.instance.startGame();
            }
        }, 0);
    },

    onDestroy() {
        EventBus.off('player:moved',   this._onLocalMove,   this);
        EventBus.off('station:pickup', this._onLocalPickup, this);
        EventBus.off('station:place',  this._onLocalPlace,  this);
        EventBus.off('station:serve',  this._onLocalServe,  this);

        if (window._nm) {
            window._nm.off('game_event', this._onGameEvent);
        }
    },

    // ─── Local → Remote ──────────────────────────────────

    _handleLocalMove(data) {
        if (data.playerId !== this._localId) return;
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_MOVE, {
            col:    data.col,
            row:    data.row,
            facing: data.facing,
        });
    },

    _handleLocalPickup(data) {
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_STATION, {
            action:      'pickup',
            stationType: data.stationType,
            col:         data.col,
            row:         data.row,
            item:        data.item || null,
        });
    },

    _handleLocalPlace(data) {
        if (!window._nm) return;
        // Bug 3 fix: ServingCounter interactions are synced via EV_SERVE (station:serve),
        // NOT through EV_STATION, to prevent double-scoring on the remote side.
        if (data.stationType === 'SERVING') return;
        window._nm.sendGameEvent(EV_STATION, {
            action:      'place',
            stationType: data.stationType,
            col:         data.col,
            row:         data.row,
            item:        data.item || null,
        });
    },

    _handleLocalServe(data) {
        // Only sync successful serves to avoid syncing failed attempts
        if (!data.success || !window._nm) return;
        window._nm.sendGameEvent(EV_SERVE, {
            col:    data.col,
            row:    data.row,
            item:   data.item,
        });
    },

    // ─── Remote → Local ──────────────────────────────────

    _applyRemoteEvent(msg) {
        const { code, data } = msg;
        if (!data) return;

        if      (code === EV_MOVE)    this._applyRemoteMove(data);
        else if (code === EV_STATION) this._applyRemoteStation(data);
        else if (code === EV_SERVE)   this._applyRemoteServe(data);
    },

    _applyRemoteMove(data) {
        if (!GameManager.instance) return;
        const remote = GameManager.instance.getPlayer(this._remoteId);
        if (!remote) { cc.log('Bridge: 找不到 remoteId =', this._remoteId); return; }
        remote.applyNetworkState(data.col, data.row, data.facing);
    },

    // Bug 4 fix: properly replay station interactions using the 'action' field.
    // pickup — create/take item and give to remote player
    // place  — force remote player to HOLDING, then let onInteract trigger _onPlace
    _applyRemoteStation(data) {
        cc.log('Bridge: 收到遠端站台互動', JSON.stringify(data));
        if (!GameManager.instance) return;

        const station = GameManager.instance.getStation(data.col, data.row);
        const remote  = GameManager.instance.getPlayer(this._remoteId);
        if (!station || !remote) return;

        const CarryState = require('../player/PlayerController').CarryState;

        if (data.action === 'pickup') {
            if (data.stationType === 'FOOD_BOX') {
                // FoodBox: always generate a new item node
                const itemNode = new cc.Node(data.item || 'noncooked_food');
                itemNode.width  = 40;
                itemNode.height = 40;
                itemNode.addComponent(cc.Sprite).spriteFrame = null;
                remote.pickUp(itemNode);
            } else {
                // Regular / CookingStation: take the held item from the station.
                // Force-clear cooking state first so _onPickup's guard passes.
                if (station._heldItem) {
                    station._cooking = false;
                    station._isDone  = false;
                    remote.pickUp(station._heldItem);
                    station._heldItem = null;
                } else {
                    // Item not on this side yet (race), create a proxy node
                    const itemNode = new cc.Node(data.item || 'item');
                    itemNode.width  = 40;
                    itemNode.height = 40;
                    itemNode.addComponent(cc.Sprite).spriteFrame = null;
                    remote.pickUp(itemNode);
                }
            }

        } else if (data.action === 'place') {
            if (!data.item) return;
            // Create item node and force remote player into HOLDING state,
            // then call onInteract so the station's _onPlace logic runs normally
            // (this also starts the cooking timer for CookingStations).
            const itemNode = new cc.Node(data.item);
            itemNode.width  = 40;
            itemNode.height = 40;
            itemNode.addComponent(cc.Sprite).spriteFrame = null;
            remote._heldItem   = itemNode;
            remote._carryState = CarryState.HOLDING;
            station.onInteract(remote);
        }
    },

    // Bug 3 fix: remote side received a successful serve event.
    // Remove the matching order from local OrderManager (without scoring),
    // then add the score and update HUD directly.
    _applyRemoteServe(data) {
        cc.log('Bridge: 收到遠端出餐', JSON.stringify(data));

        const OrderManager = require('../station/OrderManager');
        // consumeOrder returns the reward (0 if not found)
        const reward = OrderManager.instance
            ? OrderManager.instance.consumeOrder(data.item)
            : 0;

        if (reward > 0 && GameManager.instance) {
            GameManager.instance.addScore(reward);
        }

        // Emit order:completed so HUD removes the matching card
        EventBus.emit('order:completed', {
            id:     -1,
            recipe: data.item,
            score:  reward,
        });
    },
});
