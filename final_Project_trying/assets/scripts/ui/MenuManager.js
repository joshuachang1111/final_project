const LeaderboardManager = require('../core/LeaderboardManager');
const AudioManager       = require('../core/AudioManager');

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
        // ── 主選單 UI ────────────────────────────────
        mainPanel:      { default: null, type: cc.Node },

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
        // BGM bootstrap：場景檔沒掛 AudioManager 節點，這裡動態建一個。
        AudioManager.ensure();

        // 確保彈出面板預設都是隱藏的
        if (this.nicknamePanel) this.nicknamePanel.active = false;

        // Runtime patch NicknamePanel 內的文字 / 顏色（不動 menu.fire，避免改錯其他地方）
        this._patchNicknamePanel();

        this._initFirebase();
        this._showMain();
    },

    _patchNicknamePanel() {
        if (!this.nicknamePanel) return;
        const black = cc.color(0, 0, 0, 255);
        const panel = this.nicknamePanel;

        // 把整個 NicknamePanel 往上移
        panel.y = (panel.y || 0) + 120;

        // 強制 EditBox 顯示 + 提高 zIndex，避免被其他 UI 蓋住
        if (this.nicknameInput) {
            const ebNode = this.nicknameInput.node;
            ebNode.active = true;
            ebNode.opacity = 255;
            ebNode.zIndex = 50;
            cc.log('[MenuManager] EditBox 狀態: active=', ebNode.active,
                'opacity=', ebNode.opacity,
                'pos=', ebNode.x.toFixed(1), ebNode.y.toFixed(1),
                'size=', ebNode.width, '×', ebNode.height,
                'parent=', ebNode.parent && ebNode.parent.name);
        } else {
            cc.warn('[MenuManager] nicknameInput 沒綁定！EditBox 找不到');
        }

        // 檢查節點是否在 EditBox 內部子樹（PLACEHOLDER_LABEL / TEXT_LABEL），是的話跳過
        const isInsideEditBox = (node) => {
            let n = node && node.parent;
            while (n && n !== panel) {
                if (n.getComponent(cc.EditBox)) return true;
                n = n.parent;
            }
            return false;
        };

        // 改面板內所有 cc.Label（跳過 EditBox 內部，避免把 placeholder 改成「歡迎！」導致格子顯示異常）
        const labels = panel.getComponentsInChildren(cc.Label);
        labels.forEach(lbl => {
            if (isInsideEditBox(lbl.node)) return;
            if (lbl.string === '設定暱稱') {
                // 標題改黑色
                lbl.node.color = black;
            } else if (lbl.string === 'Label') {
                // 預設未改過字的 Label → 改成「歡迎！」
                lbl.string = '歡迎！';
                lbl.node.color = black;
            }
        });

        // 改面板內所有 cc.Button 的內嵌 Label → 「確認」
        const buttons = panel.getComponentsInChildren(cc.Button);
        buttons.forEach(btn => {
            const btnLabel = btn.node.getComponentInChildren(cc.Label);
            if (btnLabel) btnLabel.string = '確認';
        });
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


    _showMain() {
        this.mainPanel.active = true;
        // 回主選單才恢復使用者面板
        this._updateUserPanel();
    },

    // 建立房間 - 播開場動畫後跳轉到 room.fire
    onCreateRoom() {
        cc.log('[MenuManager] 建立房間按鈕被點擊');
        window._nmRole = 'host';
        const VideoManager = require('./VideoManager');
        VideoManager.play('bigin_video', () => cc.director.loadScene('room'));
    },

    // 加入房間 - 播開場動畫後跳轉到 room.fire
    onJoinRoomBtn() {
        cc.log('[MenuManager] 加入房間按鈕被點擊');
        window._nmRole = 'guest';
        const VideoManager = require('./VideoManager');
        VideoManager.play('bigin_video', () => cc.director.loadScene('room'));
    },

    // 排行榜 - 跳轉到 leaderboard.fire
    onLeaderboard() {
        cc.log('[MenuManager] 排行榜按鈕被點擊');
        cc.director.loadScene('leaderboard');
    },

    // 選角色按鈕
    onCharSelect() {
        cc.log('[MenuManager] 選角色按鈕被點擊');
        cc.director.loadScene('charselect');
    },
});
