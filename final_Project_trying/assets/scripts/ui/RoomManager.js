/**
 * RoomManager  (cc.Component)
 * 掛在 room.fire 場景根節點上
 *
 * 職責：
 *   - 顯示房間代碼或輸入加入代碼
 *   - 等待玩家加入
 *   - Host 按開始進遊戲
 *   - 處理網路事件
 *
 * Inspector 需綁定：
 *   hostPanel      — cc.Node，建立/等待室面板
 *   joinPanel      — cc.Node，加入代碼面板
 *   roomCodeLabel  — cc.Label，顯示 4 位房間代碼
 *   waitingLabel   — cc.Label，等待狀態文字
 *   codeInput      — cc.EditBox，輸入加入代碼
 *   joinErrorLabel — cc.Label，加入失敗錯誤訊息
 *   hostNameLabel  — cc.Label，房主名字
 *   guestNameLabel — cc.Label，加入者名字
 *   startBtn       — cc.Node，只有 Host 看得到的開始按鈕
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
        roomCodeLabel:  { default: null, type: cc.Node },
        waitingLabel:   { default: null, type: cc.Node },
        codeInput:      { default: null, type: cc.EditBox },
        joinErrorLabel: { default: null, type: cc.Node },
        hostNameLabel:  { default: null, type: cc.Node },
        guestNameLabel: { default: null, type: cc.Node },
        startBtn:       { default: null, type: cc.Node },
    },


    _autoFindNodes: function() {
        cc.log('[RoomManager] 開始自動尋找節點...');
        cc.log('[RoomManager] this.node=', this.node ? this.node.name : 'null');

        // 列出 this.node 的所有子節點
        if (this.node && this.node.children) {
            cc.log('[RoomManager] this.node 的子節點數量:', this.node.children.length);
            for (let i = 0; i < Math.min(this.node.children.length, 10); i++) {
                cc.log('[RoomManager]   子節點', i, ':', this.node.children[i].name);
            }
        }

        try {
            const hostPanel = this.node.getChildByName('hostPanel');
            cc.log('[RoomManager] 查找 hostPanel 結果:', !!hostPanel);
            if (hostPanel) {
                this.hostPanel = hostPanel;
                cc.log('[RoomManager] ✓ 找到 hostPanel');

                this.roomCodeLabel = this.hostPanel.getChildByName('roomCodeLabel');
                this.waitingLabel = this.hostPanel.getChildByName('WaitingLabel') || this.hostPanel.getChildByName('waitingLabel');
                this.hostNameLabel = this.hostPanel.getChildByName('hostNameLabel');
                this.guestNameLabel = this.hostPanel.getChildByName('guestNameLabel');
                cc.log('[RoomManager] ✓ 尋找 hostPanel 的子節點完成');
                cc.log('[RoomManager]   roomCodeLabel=', !!this.roomCodeLabel);
                cc.log('[RoomManager]   waitingLabel=', !!this.waitingLabel);
                cc.log('[RoomManager]   hostNameLabel=', !!this.hostNameLabel);
            } else {
                cc.error('[RoomManager] hostPanel 未找到！');
            }

            const joinPanel = this.node.getChildByName('joinPanel');
            if (joinPanel) {
                this.joinPanel = joinPanel;
                cc.log('[RoomManager] ✓ 找到 joinPanel');
            }

            cc.log('[RoomManager] 自動尋找節點完成！');
        } catch (err) {
            cc.error('[RoomManager] 尋找節點出錯:', err);
        }
    },

    _printNodeTree: function(node, depth) {
        depth = depth || 0;
        if (depth > 5) return;
        const indent = '  '.repeat(depth);
        cc.log(indent + node.name);
        for (let i = 0; i < node.children.length; i++) {
            this._printNodeTree(node.children[i], depth + 1);
        }
    },

    onLoad: function() {
        cc.log('[RoomManager] onLoad START - 場景樹結構：');
        this._printNodeTree(this.node);

        this._initFirebase();
        this.scheduleOnce(() => this._setupNetworkCallbacks(), 0);
        cc.log('[RoomManager] onLoad END');
    },

    // 緩存節點引用，以備後用
    _cacheNodes: function() {
        if (!this._roomCodeLabelCache && this.roomCodeLabel) {
            this._roomCodeLabelCache = this.roomCodeLabel;
            cc.log('[RoomManager] ✓ 快取 roomCodeLabel');
        }
        if (!this._waitingLabelCache && this.waitingLabel) {
            this._waitingLabelCache = this.waitingLabel;
            cc.log('[RoomManager] ✓ 快取 waitingLabel');
        }
        if (!this._hostNameLabelCache && this.hostNameLabel) {
            this._hostNameLabelCache = this.hostNameLabel;
            cc.log('[RoomManager] ✓ 快取 hostNameLabel');
        }
    },

    onDestroy: function() {
        const nm = window._nm;
        if (nm) {
            nm.off('connecting', this._onConnecting, this);
            nm.off('room_created', this._onRoomCreated, this);
            nm.off('guest_joined', this._onGuestJoined, this);
            nm.off('guest_waiting', this._onGuestWaiting, this);
            nm.off('host_info', this._onHostInfo, this);
            nm.off('start_game', this._onStartGameEvent, this);
            nm.off('error', this._onError, this);
            nm.off('player_disconnected', this._onPlayerDisconnected, this);
        }

        if (cc.isValid(this.startBtn) && cc.isValid(this.startBtn.node)) {
            this.startBtn.node.off('click', this._onStartGame, this);
        }
    },

    _initFirebase: function() {
        if (typeof firebase === 'undefined') {
            cc.error('[RoomManager] Firebase SDK 未載入');
            return;
        }
        if (!firebase.apps.length) {
            cc.log('[RoomManager] 初始化 Firebase');
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

        nm.on('connecting', function() { self._onConnecting.call(self); });
        nm.on('room_created', function(msg) { self._onRoomCreated.call(self, msg); });
        nm.on('guest_joined', function(msg) { self._onGuestJoined.call(self, msg); });
        nm.on('guest_waiting', function(msg) { self._onGuestWaiting.call(self, msg); });
        nm.on('host_info', function(msg) { self._onHostInfo.call(self, msg); });
        nm.on('start_game', function(msg) { self._onStartGameEvent.call(self, msg); });
        nm.on('error', function(msg) { self._onError.call(self, msg); });
        nm.on('player_disconnected', function() { self._onPlayerDisconnected.call(self); });
    },

    _onConnecting: function() {
        cc.log('[RoomManager] 連線中...');
        if (this.waitingLabel) {
            const label = this.waitingLabel.getComponent(cc.Label) || this.waitingLabel;
            if (label && label.string !== undefined) label.string = '連線中，請稍候...';
        }
    },

    _onRoomCreated: function(msg) {
        cc.log('[RoomManager] 房間已建立，代碼=', msg.code);

        // 從 Canvas 開始找節點（因為 RoomManager script 掛在 RoomManager 節點上）
        const canvas = this.node.parent || cc.director.getScene().getChildByName('Canvas');
        const hostPanel = canvas ? canvas.getChildByName('hostPanel') : null;

        let roomCodeNode = hostPanel ? hostPanel.getChildByName('roomCodeLabel') : null;
        let hostNameNode = hostPanel ? hostPanel.getChildByName('hostNameLabel') : null;
        let waitingNode = hostPanel ? (hostPanel.getChildByName('WaitingLabel') || hostPanel.getChildByName('waitingLabel')) : null;

        cc.log('[RoomManager] hostPanel=', !!hostPanel, ', roomCodeNode=', !!roomCodeNode);

        // 設置房間代碼
        if (roomCodeNode) {
            const label = roomCodeNode.getComponent(cc.Label);
            if (label) {
                label.string = String(msg.code);
                cc.log('[RoomManager] ✓ 已設定房間代碼:', msg.code);
            }
        } else {
            cc.error('[RoomManager] ❌ roomCodeNode 找不到！');
        }

        // 設置等待文字
        if (waitingNode) {
            const label = waitingNode.getComponent(cc.Label);
            if (label) label.string = '等待另一位玩家加入...';
        }

        // 設置房主名字
        if (hostNameNode) {
            const label = hostNameNode.getComponent(cc.Label);
            if (label) {
                const hostName = (window._fbUser && window._fbUser.displayName) || '玩家1';
                label.string = '🍳 ' + hostName;
                cc.log('[RoomManager] ✓ 已設定房主名字:', hostName);
            }
        }

        // 隱藏 Guest 名字
        const guestNameNode = hostPanel ? hostPanel.getChildByName('guestNameLabel') : null;
        if (guestNameNode) {
            guestNameNode.active = false;
        }

        // 隱藏開始按鈕
        const startBtn = hostPanel ? hostPanel.getChildByName('startBtn') : null;
        if (startBtn) startBtn.active = false;
    },

    _onGuestJoined: function(msg) {
        cc.log('[RoomManager] 玩家已加入');
        if (this.guestNameLabel) {
            const guestNode = (this.guestNameLabel.node || this.guestNameLabel);
            if (guestNode && guestNode.active !== undefined) guestNode.active = true;
            const guestLabel = this.guestNameLabel.getComponent(cc.Label) || this.guestNameLabel;
            if (guestLabel && guestLabel.string !== undefined) guestLabel.string = '🍴 ' + (msg.name || '玩家2');
        }
        if (this.waitingLabel) {
            const waitLabel = this.waitingLabel.getComponent(cc.Label) || this.waitingLabel;
            if (waitLabel && waitLabel.string !== undefined) waitLabel.string = '玩家已加入！';
        }
        if (this.startBtn) this.startBtn.active = true;
    },

    _onGuestWaiting: function(msg) {
        cc.log('[RoomManager] Guest 進入等待狀態');
        const guestName = msg.guestName || '玩家2';
        if (this.hostNameLabel) {
            const hostLabel = this.hostNameLabel.getComponent(cc.Label) || this.hostNameLabel;
            if (hostLabel && hostLabel.string !== undefined) hostLabel.string = '🍳 等待房主...';
        }
        if (this.guestNameLabel) {
            const guestNode = (this.guestNameLabel.node || this.guestNameLabel);
            if (guestNode && guestNode.active !== undefined) guestNode.active = true;
            const guestLabel = this.guestNameLabel.getComponent(cc.Label) || this.guestNameLabel;
            if (guestLabel && guestLabel.string !== undefined) guestLabel.string = '🍴 ' + guestName;
        }
        if (this.waitingLabel) {
            const waitLabel = this.waitingLabel.getComponent(cc.Label) || this.waitingLabel;
            if (waitLabel && waitLabel.string !== undefined) waitLabel.string = '等待房主開始遊戲...';
        }
        if (this.hostPanel) this.hostPanel.active = true;
        if (this.joinPanel) this.joinPanel.active = false;
        if (this.startBtn) this.startBtn.active = false;
    },

    _onHostInfo: function(msg) {
        cc.log('[RoomManager] 收到房主資訊');
        if (this.hostNameLabel) {
            const hostLabel = this.hostNameLabel.getComponent(cc.Label) || this.hostNameLabel;
            if (hostLabel && hostLabel.string !== undefined) hostLabel.string = '🍳 ' + (msg.name || '房主');
        }
    },

    _onStartGameEvent: function(msg) {
        cc.log('[RoomManager] start_game 事件，role=', window._nmRole);
        cc.sys.localStorage.setItem('playerRole', msg.role);
        cc.sys.localStorage.setItem('selectedLevel', msg.level || 'susui');
        const targetScene = window._nmRole === 'host' ? 'levelselect' : 'game';
        cc.director.loadScene(targetScene);
    },

    _onError: function(msg) {
        cc.log('[RoomManager] 網路錯誤:', msg.message);
        if (this.joinErrorLabel) {
            const errorNode = (this.joinErrorLabel.node || this.joinErrorLabel);
            if (errorNode && errorNode.active !== undefined) errorNode.active = true;
            const errorLabel = this.joinErrorLabel.getComponent(cc.Label) || this.joinErrorLabel;
            if (errorLabel && errorLabel.string !== undefined) errorLabel.string = msg.message;
        }
    },

    _onPlayerDisconnected: function() {
        cc.log('[RoomManager] 玩家斷線，回到菜單');
        cc.director.loadScene('menu');
    },

    onCreateRoom: function() {
        cc.log('[RoomManager] 建立房間按鈕被點擊');
        const nm = window._nm;
        if (nm) nm.createRoom();
    },

    onJoinRoomBtn: function() {
        cc.log('[RoomManager] 加入房間按鈕被點擊');
        if (this.joinPanel) this.joinPanel.active = true;
        if (this.hostPanel) this.hostPanel.active = false;
    },

    onConfirmJoin: function() {
        const code = this.codeInput ? this.codeInput.string.trim() : '';
        if (code.length !== 4 || isNaN(code)) {
            if (this.joinErrorLabel) {
                const errorNode = (this.joinErrorLabel.node || this.joinErrorLabel);
                if (errorNode && errorNode.active !== undefined) errorNode.active = true;
                const errorLabel = this.joinErrorLabel.getComponent(cc.Label) || this.joinErrorLabel;
                if (errorLabel && errorLabel.string !== undefined) errorLabel.string = '請輸入 4 位數字代碼';
            }
            return;
        }
        cc.log('[RoomManager] 加入房間，代碼=', code);
        const nm = window._nm;
        if (nm) nm.joinRoom(code);
    },

    onBack: function() {
        cc.log('[RoomManager] 返回按鈕被點擊');
        const nm = window._nm;
        if (nm) nm.leaveRoom();
        cc.director.loadScene('menu');
    },

    _onStartGame: function() {
        if (this._clicked) return;
        if (window._nmRole === 'guest') return;
        this._clicked = true;
        cc.log('[RoomManager] Host 開始按鈕被點擊');
        cc.director.loadScene('levelselect');
    },
});
