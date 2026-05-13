const PHOTON_APP_ID = '3bb784be-d7cb-49de-b737-c2f7b0a430f0';
const PHOTON_APP_VERSION = '1.0';

cc.Class({
    extends: cc.Component,

    onLoad() {
        // 用 cc.isValid 確認舊的 instance 是否還存活
        if (window._nm && cc.isValid(window._nm.node)) {
            this.node.destroy();
            return;
        }
        window._nm = this;
        window._nmRole = null;
        window._nmRoomCode = null;
        window._nmReady = false;   // 連上 Master Server 才變 true
        cc.game.addPersistRootNode(this.node);

        this._callbacks = {};
        this._pendingAction = null; // 連線前的待執行動作
        this._initPhoton();
    },

    _initPhoton() {
        if (typeof Photon === 'undefined') {
            cc.error('Photon SDK 未載入！請確認 photon.js 有勾選 Import As Plugin');
            return;
        }

        this._client = new Photon.LoadBalancing.LoadBalancingClient(
            Photon.ConnectionProtocol.Wss,
            PHOTON_APP_ID,
            PHOTON_APP_VERSION
        );
        window._photonClient = this._client;

        this._client.onStateChange = (state) => {
            const State = Photon.LoadBalancing.LoadBalancingClient.State;
            const name = Photon.LoadBalancing.LoadBalancingClient.StateToName(state);
            cc.log('Photon state:', name);
            // ConnectedToMasterServer 或 JoinedLobby 都代表可以建/加入房間
            if (state === State.ConnectedToMasterServer || state === State.JoinedLobby) {
                cc.log('Photon: 連上 Master Server，準備好了');
                window._nmReady = true;
                this._emit('connected', {});
                if (this._pendingAction) {
                    this._pendingAction();
                    this._pendingAction = null;
                }
            }
        };

        this._client.onJoinRoom = () => {
            const room = this._client.myRoom();
            window._nmRoomCode = room.name;
            if (room.playerCount === 1) {
                window._nmRole = 'host';
                this._emit('room_created', { code: room.name });
            } else {
                window._nmRole = 'guest';
                // Guest 主動通知 Host 開始遊戲
                this._client.raiseEvent(1, { action: 'guest_joined' });
                this._emit('start_game', { role: 'guest' });
            }
        };

        this._client.onEvent = (code, data, actorNr) => {
            cc.log('onEvent fired, code =', code, 'data =', JSON.stringify(data));
            if (code === 1 && data && data.action === 'guest_joined' && window._nmRole === 'host') {
                cc.log('Host 收到 guest 加入，開始遊戲');
                this._emit('start_game', { role: 'host' });
            } else {
                this._emit('game_event', { code, data, actorNr });
            }
        };

        this._client.onError = (errorCode, errorMsg) => {
            cc.log('Photon error:', errorCode, errorMsg);
            this._emit('error', { message: '連線錯誤：' + errorMsg });
        };

        this._client.onOperationResponse = (errorCode, _errorMsg, _code) => {
            if (errorCode !== 0) {
                this._emit('error', { message: '找不到房間，請確認代碼' });
            }
        };

        this._client.onDisconnected = () => {
            window._nmReady = false;
            this._emit('player_disconnected', {});
        };

        this._client.connectToRegionMaster('asia');
    },

    update() {
        const client = window._photonClient;
        if (!client) return;
        client.service();

        // Host 輪詢：房間滿了就開始遊戲
        if (window._nmRole === 'host' && !this._gameStarted) {
            const State = Photon.LoadBalancing.LoadBalancingClient.State;
            if (client.state === State.Joined) {
                const room = client.myRoom();
                if (room && room.playerCount >= 2) {
                    this._gameStarted = true;
                    cc.log('Host 偵測到房間已滿，開始遊戲');
                    this._emit('start_game', { role: 'host' });
                }
            }
        }
    },

    on(type, callback) {
        if (!this._callbacks) this._callbacks = {};
        this._callbacks[type] = callback;
    },

    _emit(type, data) {
        if (this._callbacks && this._callbacks[type]) this._callbacks[type](data);
    },

    createRoom() {
        const doCreate = () => {
            const code = String(Math.floor(1000 + Math.random() * 9000));
            cc.log('建立房間，代碼：', code);
            this._client.createRoom(code, { maxPlayers: 2, isVisible: false });
        };

        if (window._nmReady) {
            doCreate();
        } else {
            cc.log('尚未連線，等待連線後建立房間...');
            this._emit('connecting', {});
            this._pendingAction = doCreate;
        }
    },

    joinRoom(code) {
        const doJoin = () => {
            cc.log('加入房間，代碼：', code);
            this._client.joinRoom(code);
        };

        if (window._nmReady) {
            doJoin();
        } else {
            this._emit('connecting', {});
            this._pendingAction = doJoin;
        }
    },

    sendGameEvent(eventCode, data) {
        const client = window._photonClient;
        if (!client) { cc.error('sendGameEvent: client 不存在'); return; }
        client.raiseEvent(eventCode, data);
    },
});
