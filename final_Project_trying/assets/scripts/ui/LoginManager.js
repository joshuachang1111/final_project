/**
 * LoginManager
 * 掛在 login 場景的 Managers 節點上。
 * 使用 Firebase Google 登入。
 */

const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyAJKvWVAepCItXJxTpj5LKohYunVr1K1xM',
    authDomain:        'overcook-37ac5.firebaseapp.com',
    projectId:         'overcook-37ac5',
    storageBucket:     'overcook-37ac5.firebasestorage.app',
    messagingSenderId: '566365786141',
    appId:             '1:566365786141:web:b2b6b134ef0c231b6bf6f4',
};

const LoginManager = cc.Class({
    extends: cc.Component,

    properties: {
        errorLabel: { default: null, type: cc.Label },
        loginBtn:   { default: null, type: cc.Node  }, // Google 登入按鈕（可選，用於顯示 loading）
    },

    onLoad() {
        cc.log('LoginManager onLoad 執行');

        if (typeof firebase === 'undefined') {
            cc.error('Firebase SDK 未載入！請確認兩個 firebase-compat.js 已勾選 Import As Plugin');
            return;
        }
        cc.log('Firebase 已載入，apps:', firebase.apps.length);

        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        window._fbAuth = firebase.auth();

        // 已登入直接跳選單
        const current = window._fbAuth.currentUser;
        if (current) {
            window._fbUser = current;
            cc.director.loadScene('menu');
        }
    },

    // ── Google 登入（按鈕 onClick 綁這個）────────────

    onGoogleLogin() {
        cc.log('onGoogleLogin 被呼叫');
        if (this.errorLabel) this.errorLabel.string = '';

        const provider = new firebase.auth.GoogleAuthProvider();
        window._fbAuth.signInWithPopup(provider)
            .then(cred => {
                window._fbUser = cred.user;
                cc.log('登入成功：', cred.user.displayName);
                cc.director.loadScene('menu');
            })
            .catch(err => {
                cc.log('Google 登入失敗：', err.code, err.message);
                this._err(this._msg(err.code));
            });
    },

    // ── 輔助 ─────────────────────────────────────────

    _err(msg) {
        if (this.errorLabel) this.errorLabel.string = msg;
    },

    _msg(code) {
        return ({
            'auth/popup-closed-by-user':    '登入視窗被關閉，請再試一次',
            'auth/popup-blocked':           '瀏覽器封鎖了彈出視窗，請允許後再試',
            'auth/cancelled-popup-request': '登入已取消',
            'auth/network-request-failed':  '網路錯誤，請檢查連線',
        })[code] || '登入失敗：' + code;
    },
});

module.exports = LoginManager;
