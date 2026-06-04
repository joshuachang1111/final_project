/**
 * LeaderboardSceneManager  (cc.Component)
 * 掛在 leaderboard.fire 場景根節點上
 *
 * 職責：
 *   - 進場景時自動加載排行榜
 *   - 動態生成排行榜列表
 *   - 返回按鈕回菜單
 *   - 刷新按鈕重新加載
 *
 * Inspector 需綁定：
 *   leaderboardContent — cc.Node，ScrollView 的 Content（用來放排行榜列表）
 */

const LeaderboardManager = require('../core/LeaderboardManager');

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
        leaderboardContent: {
            default: null,
            type: cc.Node,
            tooltip: 'ScrollView 的 Content（放排行榜列表）',
        },
    },

    onLoad() {
        cc.log('[LeaderboardSceneManager] onLoad');

        // 初始化 Firebase
        this._initFirebase();

        // 直接加載排行榜
        this._loadLeaderboard();
    },

    _initFirebase() {
        if (typeof firebase === 'undefined') {
            cc.error('[LeaderboardSceneManager] Firebase SDK 未載入');
            return;
        }
        if (!firebase.apps.length) {
            cc.log('[LeaderboardSceneManager] 初始化 Firebase');
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        window._fbAuth = firebase.auth();
        window._fbUser = window._fbAuth.currentUser || null;
        cc.log('[LeaderboardSceneManager] Firebase 初始化完成');
    },

    _loadLeaderboard() {
        // 初始化 LeaderboardManager
        if (!LeaderboardManager._db) {
            cc.log('[LeaderboardSceneManager] 初始化 LeaderboardManager');
            LeaderboardManager.init();
        }

        cc.log('[LeaderboardSceneManager] 開始加載排行榜...');

        LeaderboardManager.fetchTopScores(10).then((leaderboard) => {
            cc.log('[LeaderboardSceneManager] 查詢結果=', leaderboard);

            if (!this.leaderboardContent) {
                cc.error('[LeaderboardSceneManager] leaderboardContent 未綁定！');
                return;
            }

            // 清空舊的內容
            this.leaderboardContent.removeAllChildren();

            if (leaderboard.length === 0) {
                cc.log('[LeaderboardSceneManager] 排行榜為空');
                const emptyLabel = new cc.Node('empty');
                const label = emptyLabel.addComponent(cc.Label);
                label.string = '暫無記錄';
                emptyLabel.parent = this.leaderboardContent;
                return;
            }

            // 動態生成排行榜
            cc.log('[LeaderboardSceneManager] 生成', leaderboard.length, '項排行榜');
            leaderboard.forEach((item, index) => {
                const itemNode = new cc.Node(`rank_${item.rank}`);
                itemNode.height = 40;

                const label = itemNode.addComponent(cc.Label);
                // 確保分數是有效的數字，否則顯示 0
                const score = (typeof item.score === 'number' && item.score >= 0) ? item.score : 0;
                label.string = `${item.rank}. ${item.name} ── ${item.level} ── ${score}分`;
                label.fontSize = 16;
                label.lineHeight = 40;

                itemNode.parent = this.leaderboardContent;
                itemNode.y = -(index * 45 + 20);
            });

            const contentHeight = Math.max(leaderboard.length * 45 + 40, 300);
            this.leaderboardContent.height = contentHeight;

            cc.log('[LeaderboardSceneManager] 排行榜加載完成');
        }).catch((err) => {
            cc.error('[LeaderboardSceneManager] 加載排行榜失敗:', err);
        });
    },

    // ── 按鈕 ──────────────────────────────────────

    onBack() {
        cc.log('[LeaderboardSceneManager] 返回按鈕被點擊');
        cc.director.loadScene('menu');
    },

    onRefresh() {
        cc.log('[LeaderboardSceneManager] 刷新按鈕被點擊');
        this._loadLeaderboard();
    },
});
