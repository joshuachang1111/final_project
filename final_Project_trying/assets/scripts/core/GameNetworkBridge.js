const EventBus    = require('./EventBus');
const GameManager = require('./GameManager');

// Photon event codes
const EV_MOVE    = 10;   // player movement
const EV_STATION = 11;   // station interaction (pickup / place)

cc.Class({
    extends: cc.Component,

    onLoad() {
        const role = window._nmRole || 'host';
        this._localId  = role === 'host' ? 1 : 2;
        this._remoteId = role === 'host' ? 2 : 1;
        cc.log('GameNetworkBridge: role =', role, ', localId =', this._localId);

        // Bug 5 fix: store callback references so onDestroy can remove them
        this._onLocalMove    = this._handleLocalMove.bind(this);
        this._onLocalStation = this._handleLocalStation.bind(this);
        this._onGameEvent    = (msg) => this._applyRemoteEvent(msg);

        EventBus.on('player:moved',    this._onLocalMove,    this);
        EventBus.on('station:pickup',  this._onLocalStation, this);
        EventBus.on('station:place',   this._onLocalStation, this);

        if (window._nm) {
            window._nm.on('game_event', this._onGameEvent);
        }

        // Bug 4 fix: delay one frame so all onLoad() calls finish before starting the game
        this.scheduleOnce(() => {
            if (GameManager.instance) {
                GameManager.instance.startGame();
            }
        }, 0);
    },

    onDestroy() {
        EventBus.off('player:moved',   this._onLocalMove,    this);
        EventBus.off('station:pickup', this._onLocalStation, this);
        EventBus.off('station:place',  this._onLocalStation, this);

        // Bug 5 fix: remove the named callback from NetworkManager
        if (window._nm) {
            window._nm.off('game_event', this._onGameEvent);
        }
    },

    // ─── Local → Remote ──────────────────────────────

    _handleLocalMove(data) {
        if (data.playerId !== this._localId) return;
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_MOVE, {
            col:    data.col,
            row:    data.row,
            facing: data.facing,
        });
    },

    // Bug 3 fix: sync station interactions over the network
    _handleLocalStation(data) {
        if (!window._nm) return;
        // Only the acting player sends the event; stationType disambiguates action
        window._nm.sendGameEvent(EV_STATION, {
            playerId:    this._localId,
            stationType: data.stationType,
            col:         data.col,
            row:         data.row,
            item:        data.item || null,
        });
    },

    // ─── Remote → Local ──────────────────────────────

    _applyRemoteEvent(msg) {
        const { code, data } = msg;
        if (!data) return;

        if (code === EV_MOVE) {
            this._applyRemoteMove(data);
        } else if (code === EV_STATION) {
            this._applyRemoteStation(data);
        }
    },

    _applyRemoteMove(data) {
        cc.log('Bridge: 收到遠端移動', data);
        if (!GameManager.instance) return;
        const remote = GameManager.instance.getPlayer(this._remoteId);
        if (!remote) { cc.log('Bridge: 找不到 remoteId =', this._remoteId); return; }
        remote.applyNetworkState(data.col, data.row, data.facing);
    },

    // Bug 3 fix: replay the station action on the receiving side
    _applyRemoteStation(data) {
        cc.log('Bridge: 收到遠端站台互動', data);
        if (!GameManager.instance) return;

        const station = GameManager.instance.getStation(data.col, data.row);
        if (!station) { cc.log('Bridge: 找不到 station col=%s row=%s', data.col, data.row); return; }

        const remote = GameManager.instance.getPlayer(this._remoteId);
        if (!remote) return;

        // Replay the same interact call that happened on the sender's side
        station.onInteract(remote);
    },
});
