const EventBus    = require('./EventBus');
const GameManager = require('./GameManager');

cc.Class({
    extends: cc.Component,

    onLoad() {
        const role = window._nmRole || 'host';
        this._localId  = role === 'host' ? 1 : 2;
        this._remoteId = role === 'host' ? 2 : 1;
        cc.log('GameNetworkBridge: role =', role, ', localId =', this._localId);

        // 本地玩家移動時，送給對方
        EventBus.on('player:moved', this._onLocalMove, this);

        // 收到對方的移動事件
        if (window._nm) {
            window._nm.on('game_event', (msg) => {
                this._applyRemoteState(msg.data);
            });
        }
    },

    onDestroy() {
        EventBus.off('player:moved', this._onLocalMove, this);
    },

    _onLocalMove(data) {
        if (data.playerId !== this._localId) return;
        if (!window._nm) { cc.log('Bridge: _nm 不存在'); return; }
        cc.log('Bridge: 送出移動', data.col, data.row, data.facing);
        window._nm.sendGameEvent(10, {
            col:    data.col,
            row:    data.row,
            facing: data.facing,
        });
    },

    _applyRemoteState(data) {
        cc.log('Bridge: 收到遠端移動', data);
        if (!data || !GameManager.instance) return;
        const remote = GameManager.instance.getPlayer(this._remoteId);
        if (!remote) { cc.log('Bridge: 找不到 remoteId =', this._remoteId); return; }
        remote.applyNetworkState(data.col, data.row, data.facing);
    },
});
