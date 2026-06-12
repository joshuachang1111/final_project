const LEVEL_SCENE_MAP = {
    susui:   'game',
    hansung: 'game2',
    shuimu:  'game',
    fengyun: 'game',
};

/**
 * RoomManager  (cc.Component)
 * 掛在 room.fire 場景根節點上
 *
 * 職責：
 *   - 顯示房間代碼和玩家名字
 *   - 等待玩家加入
 *   - Host 按開始進遊戲
 *   - 處理網路事件
 *
 * Inspector 需綁定：
 *   hostPanel      — cc.Node，房間面板
 *   joinPanel      — cc.Node，加入代碼面板
 *   roomCodeLabel  — cc.Label，顯示房間代碼
 *   hostNameLabel  — cc.Label，顯示房主名字
 *   guestNameLabel — cc.Label，顯示 Guest 名字
 *   waitingLabel   — cc.Label，等待狀態文字
 *   startBtn       — cc.Button，Host 開始按鈕（只有 host 看到）
 *   codeInput      — cc.EditBox，Guest 輸入房間代碼
 *   joinErrorLabel — cc.Label，加入錯誤訊息
 */

const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyAJKvWVAepCItXJxTpj5LKohYunVr1K1xM',
    authDomain:        'overcook-37ac5.firebaseapp.com',
    projectId:         'overcook-37ac5',
    storageBucket:     'overcook-37ac5.firebasestorage.app',
    messagingSenderId: '566365786141',
    appId:             '1:566365786141:web:b2b6b134ef0c231b6bf6f4',
};

cc.Class({
    extends: cc.Component,

    properties: {
        hostPanel:      { default: null, type: cc.Node },
        joinPanel:      { default: null, type: cc.Node },
        roomCodeLabel:  { default: null, type: cc.Label },
        hostNameLabel:  { default: null, type: cc.Label },
        guestNameLabel: { default: null, type: cc.Label },
        waitingLabel:   { default: null, type: cc.Label },
        startBtn:       { default: null, type: cc.Button },
        codeInput:      { default: null, type: cc.EditBox },
        joinErrorLabel: { default: null, type: cc.Label },
    },

    onLoad: function() {
        cc.log('[RoomManager] onLoad, role=', window._nmRole);

        this._initFirebase();
        this._initPanels();
        this.scheduleOnce(() => this._setupNetworkCallbacks(), 0);
    },

    onDestroy: function() {
        // 离开 room.fire 场景时，移除所有事件订阅，避免干扰其他场景
        const nm = window._nm;
        if (nm) {
            // 用保存的回調引數移除，確保只移除 RoomManager 的訂閱
            if (this._onRoomCreatedCb)        nm.off('room_created', this._onRoomCreatedCb);
            if (this._onGuestJoinedCb)        nm.off('guest_joined', this._onGuestJoinedCb);
            if (this._onGuestWaitingCb)       nm.off('guest_waiting', this._onGuestWaitingCb);
            if (this._onHostInfoCb)           nm.off('host_info', this._onHostInfoCb);
            if (this._onStartGameCb)          nm.off('start_game', this._onStartGameCb);
            if (this._onPlayerDisconnectedCb) nm.off('player_disconnected', this._onPlayerDisconnectedCb);
            if (this._onErrorCb)              nm.off('error', this._onErrorCb);
            cc.log('[RoomManager] ✓ 已移除所有事件訂閱（使用回調引參）');
        }
    },

    _initPanels: function() {
        const isHost = window._nmRole === 'host';

        cc.log('[RoomManager] _initPanels, isHost=', isHost);

        // 初始化 guestNameLabel 為空（沒有玩家加入時不顯示）
        if (this.guestNameLabel) {
            this.guestNameLabel.string = '';
        }

        // host：先隱藏，等 _onRoomCreated 觸發後再顯示
        // guest：先顯示 joinPanel，加入後才顯示 hostPanel
        if (isHost) {
            if (this.hostPanel) this.hostPanel.active = false;
            if (this.joinPanel) this.joinPanel.active = false;
        } else {
            if (this.hostPanel) this.hostPanel.active = false;
            if (this.joinPanel) this.joinPanel.active = true;
            if (this.joinErrorLabel) this.joinErrorLabel.string = ''; // 初始化為空
        }
    },

    _switchToHostPanel: function() {
        if (this.hostPanel) this.hostPanel.active = true;
        if (this.joinPanel) this.joinPanel.active = false;
    },

    _initFirebase: function() {
        if (typeof firebase === 'undefined') {
            cc.error('[RoomManager] Firebase SDK 未載入');
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        window._fbAuth = firebase.auth();
        window._fbUser = window._fbAuth.currentUser || null;
        cc.log('[RoomManager] Firebase 初始化完成');
    },

    _setupNetworkCallbacks: function() {
        const nm = window._nm;
        if (!nm) {
            cc.error('[RoomManager] NetworkManager 找不到');
            return;
        }

        const self = this;
        // 保存所有回調引數，以便在 onDestroy 時正確移除
        this._onRoomCreatedCb = function(msg) { self._onRoomCreated.call(self, msg); };
        this._onGuestJoinedCb = function(msg) { self._onGuestJoined.call(self, msg); };
        this._onGuestWaitingCb = function() { self._onGuestWaiting.call(self); };
        this._onHostInfoCb = function(msg) { self._onHostInfo.call(self, msg); };
        this._onStartGameCb = function(msg) { self._onStartGameEvent.call(self, msg); };
        this._onPlayerDisconnectedCb = function() { self._onPlayerDisconnected.call(self); };
        this._onErrorCb = function(msg) { self._onNetworkError.call(self, msg); };

        nm.on('room_created', this._onRoomCreatedCb);
        nm.on('guest_joined', this._onGuestJoinedCb);
        nm.on('guest_waiting', this._onGuestWaitingCb);
        nm.on('host_info', this._onHostInfoCb);
        nm.on('start_game', this._onStartGameCb);
        nm.on('player_disconnected', this._onPlayerDisconnectedCb);
        nm.on('error', this._onErrorCb);

        cc.log('[RoomManager] ✓ 已訂閱所有事件');

        // 如果是 Host，立即建立房間
        if (window._nmRole === 'host') {
            cc.log('[RoomManager] Host role detected, creating room...');
            nm.createRoom();
        } else {
            cc.log('[RoomManager] Not host, waiting for join input');
        }
    },

    _onRoomCreated: function(msg) {
        cc.log('[RoomManager] 房間已建立，代碼=', msg.code);

        if (this.roomCodeLabel) {
            this.roomCodeLabel.string = String(msg.code);
            cc.log('[RoomManager] ✓ 已設定房間代碼:', msg.code);
        }

        if (this.hostNameLabel) {
            const hostName = (window._fbUser && window._fbUser.displayName) || '玩家1';
            this.hostNameLabel.string = '🍳 ' + hostName;
            cc.log('[RoomManager] ✓ 已設定房主名字:', hostName);
        }

        // 初始化 guestNameLabel 隱藏，等 guest 加入後才顯示
        if (this.guestNameLabel) {
            this.guestNameLabel.node.active = false;
        }

        if (this.waitingLabel) {
            this.waitingLabel.string = '等待另一位玩家加入...';
        }

        // start 按鈕初始隱藏，只在 guest 加入時才顯示（且只有 host 看得到）
        if (this.startBtn) {
            this.startBtn.node.active = false;
        }

        // 現在才顯示 hostPanel（已填充代碼和名字）
        if (this.hostPanel) {
            this.hostPanel.active = true;
            cc.log('[RoomManager] ✓ 顯示 hostPanel');
        }
    },

    _onGuestJoined: function(msg) {
        cc.log('[RoomManager] 玩家已加入');

        // 如果是 host，更新 guest 名字並顯示 start 按鈕
        if (window._nmRole === 'host') {
            if (this.guestNameLabel && msg && msg.name) {
                this.guestNameLabel.string = '🧑 ' + msg.name;
                this.guestNameLabel.node.active = true; // 顯示 guest 名字
                cc.log('[RoomManager] ✓ 已設定 guest 名字:', msg.name);
            }

            if (this.startBtn) {
                this.startBtn.node.active = true;
                cc.log('[RoomManager] ✓ 顯示 start 按鈕');
            }

            // 兩人都到齊了，房號就不用再給 host 看（不然 Guest 也已經知道了）
            if (this.roomCodeLabel) {
                this.roomCodeLabel.node.active = false;
                cc.log('[RoomManager] ✓ 隱藏房號（兩人到齊）');
            }
        }

        if (this.waitingLabel) {
            this.waitingLabel.string = '玩家已加入！';
        }
    },

    _onGuestWaiting: function() {
        cc.log('[RoomManager] Guest 進入等待狀態');

        this._switchToHostPanel();

        // Guest 自己加入時，host 一定已經在 → 兩人到齊，直接藏房號（房號是給
        // 「等對方加入」階段看的，加進來之後沒用了，而且 Guest 自己剛剛才打過代碼）。
        // guestNameLabel 補上自己的名字（原本只有 Host 的 _onGuestJoined 會填，
        // Guest 永遠不會跑那條，所以自己畫面上自己名字是空的）。
        if (this.roomCodeLabel) {
            this.roomCodeLabel.node.active = false;
            cc.log('[RoomManager] ✓ Guest 端隱藏房號（兩人到齊）');
        }
        if (this.guestNameLabel) {
            const guestName = (window._fbUser && window._fbUser.displayName) || '玩家2';
            this.guestNameLabel.string = '🧑 ' + guestName;
            this.guestNameLabel.node.active = true;
            cc.log('[RoomManager] ✓ Guest 端顯示自己名字:', guestName);
        }

        // 如果是 guest，確保 start 按鈕隱藏
        if (window._nmRole === 'guest' && this.startBtn) {
            this.startBtn.node.active = false;
            cc.log('[RoomManager] ✓ Guest 模式，隱藏 start 按鈕');
        }

        if (this.waitingLabel) {
            this.waitingLabel.string = '等待房主開始遊戲...';
        }
    },

    _onHostInfo: function(msg) {
        cc.log('[RoomManager] 收到房主資訊，名字=', msg.name);

        // Guest 端收到 host 名字，更新 hostNameLabel
        if (this.hostNameLabel && msg && msg.name) {
            this.hostNameLabel.string = '🍳 ' + msg.name;
            cc.log('[RoomManager] ✓ 已設定房主名字:', msg.name);
        }
    },

    _onStartGameEvent: function(msg) {
        cc.log('[RoomManager] 開始遊戲，role=', window._nmRole);
        cc.sys.localStorage.setItem('playerRole', msg.role);
        const levelId = msg.level || 'susui';
        cc.sys.localStorage.setItem('selectedLevel', levelId);
        const targetScene = window._nmRole === 'host' ? 'levelselect' : (LEVEL_SCENE_MAP[levelId] || 'game');
        cc.director.loadScene(targetScene);
    },

    _onPlayerDisconnected: function() {
        cc.log('[RoomManager] 玩家斷線，回到菜單');
        cc.director.loadScene('menu');
    },

    _onNetworkError: function(msg) {
        cc.log('[RoomManager] 網路錯誤:', msg);

        // Guest 加入失敗時顯示錯誤
        if (window._nmRole === 'guest' && this.joinErrorLabel) {
            this.joinErrorLabel.string = msg || '加入房間失敗，請檢查代碼';
            cc.log('[RoomManager] ✗ Guest 加入失敗:', msg);
        }
    },

    onStartGame: function() {
        if (window._nmRole === 'guest') return;
        cc.log('[RoomManager] Host 開始按鈕被點擊');
        cc.director.loadScene('levelselect');
    },

    onConfirmJoin: function() {
        const code = this.codeInput ? this.codeInput.string.trim() : '';

        // 驗證
        if (!code || code.length !== 4) {
            if (this.joinErrorLabel) {
                this.joinErrorLabel.string = '請輸入 4 位代碼';
                cc.log('[RoomManager] ✗ 代碼驗證失敗');
            }
            return;
        }

        // 驗證通過，清除錯誤訊息
        if (this.joinErrorLabel) {
            this.joinErrorLabel.string = '';
        }

        cc.log('[RoomManager] Guest 加入房間，代碼=', code);
        const nm = window._nm;
        if (nm) {
            nm.joinRoom(code);
        }
    },

    onBack: function() {
        cc.log('[RoomManager] 返回按鈕被點擊');
        const nm = window._nm;
        if (nm) nm.leaveRoom();
        cc.director.loadScene('menu');
    },
});
