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
        // ── 房間 UI ──────────────────────────────────
        mainPanel:      { default: null, type: cc.Node },
        hostPanel:      { default: null, type: cc.Node },
        joinPanel:      { default: null, type: cc.Node },
        roomCodeLabel:  { default: null, type: cc.Label },
        waitingLabel:   { default: null, type: cc.Label },
        codeInput:      { default: null, type: cc.EditBox },
        joinErrorLabel: { default: null, type: cc.Label },

        // ── 等待室玩家名字 ────────────────────────────
        hostNameLabel:  { default: null, type: cc.Label }, // 顯示房主名字
        guestNameLabel: { default: null, type: cc.Label }, // 顯示加入者名字
        startBtn:       { default: null, type: cc.Node  }, // 只有 Host 看得到的開始按鈕

        // ── 使用者面板（左上角）──────────────────────
        loginBtn:       { default: null, type: cc.Node   }, // 未登入時顯示
        userInfoNode:   { default: null, type: cc.Node   }, // 已登入時顯示
        userAvatarSprite: { default: null, type: cc.Sprite }, // 頭像
        userNameLabel:  { default: null, type: cc.Label  }, // 暱稱文字

        // ── 暱稱設定面板 ─────────────────────────────
        nicknamePanel:  { default: null, type: cc.Node   }, // 彈出面板
        nicknameInput:  { default: null, type: cc.EditBox },
        nicknameError:  { default: null, type: cc.Label  },
    },

    onLoad() {
        // 確保彈出面板預設都是隱藏的
        if (this.nicknamePanel) this.nicknamePanel.active = false;
        if (this.startBtn)      this.startBtn.active      = false;
        if (this.guestNameLabel) this.guestNameLabel.node.active = false;

        this._initFirebase();
        this._showMain();
        this.scheduleOnce(() => this._setupNetworkCallbacks(), 0);
    },

    // ── Firebase ─────────────────────────────────────

    _initFirebase() {
        if (typeof firebase === 'undefined') return;
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        window._fbAuth = firebase.auth();
        window._fbUser = window._fbAuth.currentUser || null;
        this._updateUserPanel();
    },

    // ── Google 登入（LoginBtn 的 onClick）────────────

    onLoginWithGoogle() {
        if (typeof firebase === 'undefined') {
            cc.error('Firebase SDK 未載入');
            return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        window._fbAuth.signInWithPopup(provider)
            .then(cred => {
                window._fbUser = cred.user;
                this._showNicknamePanel();
            })
            .catch(err => cc.log('Google 登入失敗：', err.code));
    },

    // ── 暱稱面板 ─────────────────────────────────────

    _showNicknamePanel() {
        if (!this.nicknamePanel) return;
        this.nicknamePanel.active = true;
        // 預填 Google 帳號名稱
        if (this.nicknameInput && window._fbUser) {
            this.nicknameInput.string = window._fbUser.displayName || '';
        }
    },

    onConfirmNickname() {
        const name = this.nicknameInput ? this.nicknameInput.string.trim() : '';
        if (!name) {
            if (this.nicknameError) this.nicknameError.string = '請輸入暱稱';
            return;
        }
        window._fbUser.updateProfile({ displayName: name })
            .then(() => {
                window._fbUser = window._fbAuth.currentUser;
                if (this.nicknamePanel) this.nicknamePanel.active = false;
                this._updateUserPanel();
            })
            .catch(err => {
                if (this.nicknameError) this.nicknameError.string = '更新失敗，請再試一次';
                cc.log('updateProfile 失敗：', err);
            });
    },

    // ── 更新左上角使用者面板 ──────────────────────────

    _updateUserPanel() {
        const loggedIn = !!window._fbUser;
        if (this.loginBtn)     this.loginBtn.active     = !loggedIn;
        if (this.userInfoNode) this.userInfoNode.active  = loggedIn;

        if (loggedIn) {
            if (this.userNameLabel) {
                this.userNameLabel.string = window._fbUser.displayName || window._fbUser.email;
            }
            // 載入 Google 頭像
            const photoURL = window._fbUser.photoURL;
            if (photoURL && this.userAvatarSprite) {
                cc.loader.load({ url: photoURL, type: cc.Texture2D }, (err, tex) => {
                    if (!err && this.userAvatarSprite) {
                        this.userAvatarSprite.spriteFrame = new cc.SpriteFrame(tex);
                    }
                });
            }
        }
    },

    _setupNetworkCallbacks() {
        const nm = window._nm;
        if (!nm) {
            cc.error('NetworkManager 找不到！請確認場景裡有 NetworkManager 節點並掛上腳本');
            return;
        }

        nm.on('connecting', () => {
            this.waitingLabel.node.active = true;
            this.waitingLabel.string = '連線中，請稍候...';
            this._showHost();
        });

        nm.on('room_created', (msg) => {
            this.roomCodeLabel.string = msg.code;
            this.waitingLabel.string = '等待另一位玩家加入...';
            // 顯示房主名字
            const hostName = (window._fbUser && window._fbUser.displayName) || '玩家1';
            if (this.hostNameLabel) this.hostNameLabel.string = '🍳 ' + hostName;
            if (this.guestNameLabel) this.guestNameLabel.node.active = false;
            if (this.startBtn) this.startBtn.active = false;
            this._showHost();
        });

        nm.on('guest_joined', (msg) => {
            // Host 看到：顯示 guest 名字並開放開始按鈕
            if (this.guestNameLabel) {
                this.guestNameLabel.node.active = true;
                this.guestNameLabel.string = '🍴 ' + (msg.name || '玩家2');
            }
            if (this.waitingLabel) this.waitingLabel.string = '玩家已加入！';
            if (this.startBtn) this.startBtn.active = true;
        });

        nm.on('guest_waiting', (msg) => {
            // Guest 看到：進入等待畫面，顯示自己名字，沒有開始按鈕
            const guestName = msg.guestName || '玩家2';
            if (this.hostNameLabel)  this.hostNameLabel.string = '🍳 等待房主...';
            if (this.guestNameLabel) {
                this.guestNameLabel.node.active = true;
                this.guestNameLabel.string = '🍴 ' + guestName;
            }
            if (this.waitingLabel) this.waitingLabel.string = '等待房主開始遊戲...';
            if (this.startBtn) this.startBtn.active = false;
            this._showHost();
        });

        nm.on('host_info', (msg) => {
            // Guest 收到 host 名字後更新顯示
            if (this.hostNameLabel) this.hostNameLabel.string = '🍳 ' + (msg.name || '房主');
        });

        nm.on('start_game', (msg) => {
            cc.sys.localStorage.setItem('playerRole', msg.role);
            cc.director.loadScene('game');
        });

        nm.on('error', (msg) => {
            this.joinErrorLabel.string = msg.message;
            this.joinErrorLabel.node.active = true;
        });

        nm.on('player_disconnected', () => {
            this._showMain();
        });

        cc.log('MenuManager: NetworkManager 綁定成功');
    },

    _showMain() {
        this.mainPanel.active = true;
        this.hostPanel.active = false;
        this.joinPanel.active = false;
        // 回主選單才恢復使用者面板
        this._updateUserPanel();
    },

    _showHost() {
        this.mainPanel.active = false;
        this.hostPanel.active = true;
        this.joinPanel.active = false;
        // 進入等待室隱藏登入按鈕，避免在等待中途切換帳號
        if (this.loginBtn)     this.loginBtn.active     = false;
        if (this.userInfoNode) this.userInfoNode.active  = false;
    },

    _showJoin() {
        this.mainPanel.active = false;
        this.hostPanel.active = false;
        this.joinPanel.active = true;
        this.joinErrorLabel.node.active = false;
        this.codeInput.string = '';
    },

    onCreateRoom() {
        cc.log('onCreateRoom clicked');
        const nm = window._nm;
        if (!nm || !cc.isValid(nm.node)) {
            cc.error('NetworkManager 不存在或已銷毀');
            return;
        }
        nm.createRoom();
    },

    onJoinRoomBtn() {
        this._showJoin();
    },

    onConfirmJoin() {
        const code = this.codeInput.string.trim();
        if (code.length !== 4 || isNaN(code)) {
            this.joinErrorLabel.string = '請輸入 4 位數字代碼';
            this.joinErrorLabel.node.active = true;
            return;
        }
        const nm = window._nm;
        if (nm) nm.joinRoom(code);
    },

    onBack() {
        this._showMain();
    },

    // HostPanel 的 Back 按鈕
    onBackFromHost() {
        const nm = window._nm;
        if (nm) nm.leaveRoom();
        this._showMain();
    },

    // Host 按下開始按鈕
    onStartGame() {
        const nm = window._nm;
        if (!nm) return;
        nm.startGame();
    },
});
