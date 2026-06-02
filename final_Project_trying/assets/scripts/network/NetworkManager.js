const PHOTON_APP_ID = '3bb784be-d7cb-49de-b737-c2f7b0a430f0';
const PHOTON_APP_VERSION = '1.0';

cc.Class({
    extends: cc.Component,

    onLoad() {
        cc.log('【NetworkManager onLoad】初始化...');
        if (window._nm && cc.isValid(window._nm.node)) {
            cc.log('【NetworkManager onLoad】已存在，銷毀重複');
            this.node.destroy();
            return;
        }
        window._nm = this;
        window._nmRole = null;
        window._nmRoomCode = null;
        window._nmReady = false;
        cc.log('【NetworkManager onLoad】設為 persistent');
        cc.game.addPersistRootNode(this.node);

        this._callbacks = {};
        this._pendingAction = null;
        this._gameStarted = false;
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
                const guestName = (window._fbUser && window._fbUser.displayName) || '玩家2';
                this._client.raiseEvent(1, { action: 'guest_joined', name: guestName });
                // 通知 UI 顯示等待畫面，等 Host 按開始
                this._emit('guest_waiting', { guestName });
            }
        };

        this._client.onEvent = (code, data, actorNr) => {
            cc.log('onEvent fired, code =', code, 'data =', JSON.stringify(data));
            if (code === 1 && data && data.action === 'guest_joined' && window._nmRole === 'host') {
                // Host 收到 guest 加入，回傳自己名字，顯示等待開始畫面
                const hostName = (window._fbUser && window._fbUser.displayName) || '玩家1';
                this._client.raiseEvent(3, { action: 'host_info', name: hostName });
                this._emit('guest_joined', { name: data.name });
            } else if (code === 2 && data && data.action === 'host_start') {
                // Host 選完餐廳，通知 Guest 進入遊戲
                cc.log('【Code 2 收到】role=', window._nmRole, 'data=', JSON.stringify(data), '_gameStarted=', this._gameStarted);
                if (!this._gameStarted) {
                    this._gameStarted = true;
                    cc.log('【emit start_game】即將進入遊戲');
                    this._emit('start_game', { role: window._nmRole, level: data.level || 'susui' });
                } else {
                    cc.log('【Code 2 忽略】_gameStarted 已為 true');
                }
            } else if (code === 3 && data && data.action === 'host_info' && window._nmRole === 'guest') {
                this._emit('host_info', { name: data.name });
            } else {
                this._emit('game_event', { code, data, actorNr });
            }
        };

        this._client.onError = (errorCode, errorMsg) => {
            cc.log('Photon error:', errorCode, errorMsg);
            this._emit('error', { message: '連線錯誤：' + errorMsg });
        };

        this._client.onOperationResponse = (errorCode, _errorMsg, code) => {
            if (errorCode !== 0) {
                if (code === 255 || code === 227) {
                    this._emit('error', { message: '找不到房間，請確認代碼' });
                } else {
                    this._emit('error', { message: '操作失敗 (code ' + code + ')' });
                }
            }
        };

        this._client.onDisconnected = () => {
            window._nmReady = false;
            this._gameStarted = false;
            this._emit('player_disconnected', {});
        };

        this._client.connectToRegionMaster('asia');
    },

    // 支援同一事件多個 callback
    on(type, callback) {
        if (!this._callbacks) this._callbacks = {};
        if (!this._callbacks[type]) this._callbacks[type] = [];
        this._callbacks[type].push(callback);
    },

    off(type, callback) {
        if (!this._callbacks || !this._callbacks[type]) return;
        this._callbacks[type] = this._callbacks[type].filter(cb => cb !== callback);
    },

    _emit(type, data) {
        if (!this._callbacks || !this._callbacks[type]) return;
        this._callbacks[type].slice().forEach(cb => cb(data));
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

    // Host 按下開始後呼叫
    startGame(level) {
        cc.log('【startGame 被呼叫】level=', level, '_gameStarted=', this._gameStarted);
        if (this._gameStarted) {
            cc.log('【startGame 早已執行，忽略】');
            return;
        }
        this._gameStarted = true;
        const levelId = level || 'susui';
        cc.log('【Host startGame】level=', levelId, '廣播 code 2...');
        cc.log('【raiseEvent】code=2, data=', { action: 'host_start', level: levelId });
        this._client.raiseEvent(2, { action: 'host_start', level: levelId });
        cc.log('【Host emit start_game】進入遊戲');
        this._emit('start_game', { role: 'host', level: levelId });
    },

    leaveRoom() {
        this._gameStarted = false;
        window._nmRole = null;
        window._nmRoomCode = null;
        if (this._client) {
            try { this._client.leaveRoom(); } catch(e) {}
        }
    },
});
