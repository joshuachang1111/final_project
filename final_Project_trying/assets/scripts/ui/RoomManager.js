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
        this._showRolePanel();
        this.scheduleOnce(() => this._setupNetworkCallbacks(), 0);
    },

    _showRolePanel: function() {
        const isHost = window._nmRole === 'host';

        cc.log('[RoomManager] _showRolePanel, isHost=', isHost);

        // guest 進入時先顯示 joinPanel（輸入代碼），加入後才顯示 hostPanel
        // host 直接顯示 hostPanel
        if (isHost) {
            if (this.hostPanel) this.hostPanel.active = true;
            if (this.joinPanel) this.joinPanel.active = false;
        } else {
            if (this.hostPanel) this.hostPanel.active = false;
            if (this.joinPanel) this.joinPanel.active = true;
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
        nm.on('room_created', function(msg) { self._onRoomCreated.call(self, msg); });
        nm.on('guest_joined', function(msg) { self._onGuestJoined.call(self, msg); });
        nm.on('guest_waiting', function() { self._onGuestWaiting.call(self); });
        nm.on('start_game', function(msg) { self._onStartGameEvent.call(self, msg); });
        nm.on('player_disconnected', function() { self._onPlayerDisconnected.call(self); });

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

        if (this.waitingLabel) {
            this.waitingLabel.string = '等待另一位玩家加入...';
        }

        // start 按鈕初始隱藏，只在 guest 加入時才顯示（且只有 host 看得到）
        if (this.startBtn) {
            this.startBtn.node.active = false;
        }
    },

    _onGuestJoined: function(msg) {
        cc.log('[RoomManager] 玩家已加入');

        // 如果是 host，更新 guest 名字並顯示 start 按鈕
        if (window._nmRole === 'host') {
            if (this.guestNameLabel && msg && msg.name) {
                this.guestNameLabel.string = '🧑 ' + msg.name;
                cc.log('[RoomManager] ✓ 已設定 guest 名字:', msg.name);
            }

            if (this.startBtn) {
                this.startBtn.node.active = true;
                cc.log('[RoomManager] ✓ 顯示 start 按鈕');
            }
        }

        if (this.waitingLabel) {
            this.waitingLabel.string = '玩家已加入！';
        }
    },

    _onGuestWaiting: function() {
        cc.log('[RoomManager] Guest 進入等待狀態');

        this._switchToHostPanel();

        // 如果是 guest，確保 start 按鈕隱藏
        if (window._nmRole === 'guest' && this.startBtn) {
            this.startBtn.node.active = false;
            cc.log('[RoomManager] ✓ Guest 模式，隱藏 start 按鈕');
        }

        if (this.waitingLabel) {
            this.waitingLabel.string = '等待房主開始遊戲...';
        }
    },

    _onStartGameEvent: function(msg) {
        cc.log('[RoomManager] 開始遊戲，role=', window._nmRole);
        cc.sys.localStorage.setItem('playerRole', msg.role);
        cc.sys.localStorage.setItem('selectedLevel', msg.level || 'susui');
        const targetScene = window._nmRole === 'host' ? 'levelselect' : 'game';
        cc.director.loadScene(targetScene);
    },

    _onPlayerDisconnected: function() {
        cc.log('[RoomManager] 玩家斷線，回到菜單');
        cc.director.loadScene('menu');
    },

    onStartGame: function() {
        if (window._nmRole === 'guest') return;
        cc.log('[RoomManager] Host 開始按鈕被點擊');
        cc.director.loadScene('levelselect');
    },

    onConfirmJoin: function() {
        const code = this.codeInput ? this.codeInput.string.trim() : '';
        if (!code || code.length !== 4) {
            if (this.joinErrorLabel) {
                this.joinErrorLabel.string = '請輸入 4 位代碼';
            }
            return;
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
