/**
 * ResultSceneManager  (cc.Component)
 * 掛在 result.fire 場景的根節點上
 *
 * 負責：
 *   - 顯示遊戲分數
 *   - 上傳分數到排行榜
 *   - 顯示排行榜
 *   - 處理「重玩」「回菜單」按鈕
 *
 * Inspector 需綁定：
 *   scoreLabel         — cc.Label，顯示最終分數
 *   replayBtn          — cc.Button，再玩一次
 *   menuBtn            — cc.Button，回主選單
 *   leaderboardBtn     — cc.Button，查看排行榜
 *   leaderboardPanel   — cc.Node，排行榜面板（預設 active = false）
 *   leaderboardContent — cc.Node，排行榜內容（ScrollView 的 Content）
 */

const EventBus = require('../core/EventBus');
const LeaderboardManager = require('../core/LeaderboardManager');

const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyAJKvWVAepCItXJxTpj5LKohYunVr1K1xM',
    authDomain:        'overcook-37ac5.firebaseapp.com',
    projectId:         'overcook-37ac5',
    storageBucket:     'overcook-37ac5.firebasestorage.app',
    messagingSenderId: '566365786141',
    appId:             '1:566365786141:web:b2b6b134ef0c231b6bf6f4',
};

const ResultSceneManager = cc.Class({
    extends: cc.Component,

    properties: {
        scoreLabel: {
            default: null,
            type: cc.Label,
            tooltip: '顯示最終分數',
        },
        replayBtn: {
            default: null,
            type: cc.Button,
            tooltip: '再玩一次按鈕',
        },
        menuBtn: {
            default: null,
            type: cc.Button,
            tooltip: '回主選單按鈕',
        },
        leaderboardBtn: {
            default: null,
            type: cc.Button,
            tooltip: '排行榜按鈕',
        },
        leaderboardPanel: {
            default: null,
            type: cc.Node,
            tooltip: '排行榜面板，預設 active = false',
        },
        leaderboardContent: {
            default: null,
            type: cc.Node,
            tooltip: 'ScrollView 的 Content（用來放排行榜列表）',
        },
    },

    onLoad() {
        cc.log('[ResultSceneManager] onLoad');

        // 初始化 Firebase（如果還沒初始化）
        this._initFirebase();

        if (this.leaderboardPanel) this.leaderboardPanel.active = false;

        // Guest 不能重玩，只能看排行榜或回菜單
        const isHost = window._nmRole !== 'guest';
        if (this.replayBtn) {
            this.replayBtn.node.active = isHost;  // 只有 Host 能重玩
            if (isHost) {
                this.replayBtn.node.on('click', this._onReplay, this);
            }
        }

        if (this.menuBtn) {
            this.menuBtn.node.on('click', this._onMenu, this);
        }
        if (this.leaderboardBtn) {
            this.leaderboardBtn.node.on('click', this._onLeaderboard, this);
        }

        // 監聽遊戲結束事件，顯示分數並上傳排行榜
        EventBus.on('game:end', this._onGameEnd, this);
    },

    _initFirebase() {
        if (typeof firebase === 'undefined') {
            cc.error('[ResultSceneManager] Firebase SDK 未載入');
            return;
        }
        if (!firebase.apps.length) {
            cc.log('[ResultSceneManager] 初始化 Firebase');
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        window._fbAuth = firebase.auth();
        window._fbUser = window._fbAuth.currentUser || null;
        cc.log('[ResultSceneManager] Firebase 初始化完成，user=', !!window._fbUser);
    },

    onDestroy() {
        EventBus.off('game:end', this._onGameEnd, this);

        if (cc.isValid(this.replayBtn) && cc.isValid(this.replayBtn.node)) {
            this.replayBtn.node.off('click', this._onReplay, this);
        }
        if (cc.isValid(this.menuBtn) && cc.isValid(this.menuBtn.node)) {
            this.menuBtn.node.off('click', this._onMenu, this);
        }
        if (cc.isValid(this.leaderboardBtn) && cc.isValid(this.leaderboardBtn.node)) {
            this.leaderboardBtn.node.off('click', this._onLeaderboard, this);
        }
    },

    // ── 遊戲結束 ──────────────────────────────────

    _onGameEnd(data) {
        cc.log('[ResultSceneManager] 遊戲結束，分數:', data.score);

        // 顯示分數
        if (this.scoreLabel) {
            this.scoreLabel.string = '最終分數: ' + data.score;
        }

        // Host 才上傳分數到排行榜
        const isHost = window._nmRole !== 'guest';
        cc.log('[ResultSceneManager] 診斷:');
        cc.log('  - window._nmRole=', window._nmRole);
        cc.log('  - isHost=', isHost);
        cc.log('  - window._fbUser=', !!window._fbUser);

        if (isHost && window._fbUser) {
            cc.log('[ResultSceneManager] ✓ 條件滿足，呼叫 _submitScore');
            this._submitScore(data.score);
        } else {
            cc.log('[ResultSceneManager] ✗ 條件不滿足，不上傳分數');
        }
    },

    _submitScore(score) {
        cc.log('[ResultSceneManager] 開始提交分數:', score);
        cc.log('[ResultSceneManager] window._fbUser:', window._fbUser ? '✓ 存在' : '✗ 不存在');

        if (!LeaderboardManager._db) {
            cc.log('[ResultSceneManager] 初始化 LeaderboardManager');
            LeaderboardManager.init();
        }

        const level = cc.sys.localStorage.getItem('selectedLevel') || 'unknown';
        const playerName = (window._fbUser && window._fbUser.displayName) || '訪客';
        const uid = (window._fbUser && window._fbUser.uid) || 'guest_' + Date.now();

        cc.log('[ResultSceneManager] 上傳數據:', {
            playerName: playerName,
            uid: uid,
            score: score,
            level: level,
        });

        LeaderboardManager.submitScore({
            playerName: playerName,
            uid: uid,
            score: score,
            level: level,
        }).then((success) => {
            if (success) {
                cc.log('[ResultSceneManager] ✓ 分數已成功上傳到 Firebase！');
            } else {
                cc.error('[ResultSceneManager] ✗ 分數提交返回 false');
            }
        }).catch((err) => {
            cc.error('[ResultSceneManager] ✗ 上傳分數失敗:', err);
        });
    },

    // ── 按鈕事件 ──────────────────────────────────

    _onReplay() {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[ResultSceneManager] 再玩一次');

        const isHost = window._nmRole !== 'guest';
        if (isHost && window._nm && typeof window._nm.sendResultChoice === 'function') {
            window._nm.sendResultChoice('replay');
        }

        if (window._nm) window._nm._gameStarted = false;
        EventBus.clear();
        this.scheduleOnce(() => {
            cc.director.loadScene('levelselect');
        }, 0.2);
    },

    _onMenu() {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[ResultSceneManager] 回主選單');

        const isHost = window._nmRole !== 'guest';
        if (isHost && window._nm && typeof window._nm.sendResultChoice === 'function') {
            window._nm.sendResultChoice('menu');
        }

        this.scheduleOnce(() => {
            if (window._nm && typeof window._nm.leaveRoom === 'function') {
                window._nm.leaveRoom();
            }
            EventBus.clear();
            cc.director.loadScene('menu');
        }, 0.3);
    },

    _onLeaderboard() {
        cc.log('[ResultSceneManager] 查看排行榜按鈕被點擊');
        cc.director.loadScene('leaderboard');
    },

    onCloseLeaderboard() {
        if (this.leaderboardPanel) {
            this.leaderboardPanel.active = false;
        }
    },

    _loadLeaderboard() {
        cc.log('[ResultSceneManager] 開始加載排行榜...');

        cc.log('[ResultSceneManager] LeaderboardManager._db=', !!LeaderboardManager._db);
        if (!LeaderboardManager._db) {
            cc.log('[ResultSceneManager] 初始化 LeaderboardManager');
            const initSuccess = LeaderboardManager.init();
            cc.log('[ResultSceneManager] 初始化結果=', initSuccess);
        }

        cc.log('[ResultSceneManager] 查詢排行榜...');
        LeaderboardManager.fetchTopScores(10).then((leaderboard) => {
            cc.log('[ResultSceneManager] 查詢結果=', leaderboard);

            if (!this.leaderboardContent) {
                cc.error('[ResultSceneManager] leaderboardContent 未綁定！');
                return;
            }

            // 清空舊的內容
            this.leaderboardContent.removeAllChildren();

            if (leaderboard.length === 0) {
                cc.log('[ResultSceneManager] 排行榜為空');
                const emptyLabel = new cc.Node('empty');
                const label = emptyLabel.addComponent(cc.Label);
                label.string = '暫無記錄';
                emptyLabel.parent = this.leaderboardContent;
                return;
            }

            // 動態生成排行榜
            cc.log('[ResultSceneManager] 生成', leaderboard.length, '項排行榜');
            leaderboard.forEach((item, index) => {
                const itemNode = new cc.Node(`rank_${item.rank}`);
                itemNode.height = 40;

                const label = itemNode.addComponent(cc.Label);
                label.string = `${item.rank}. ${item.name} ── ${item.level} ── ${item.score}分`;
                label.fontSize = 16;
                label.lineHeight = 40;

                itemNode.parent = this.leaderboardContent;
                itemNode.y = -(index * 45 + 20);
            });

            const contentHeight = Math.max(leaderboard.length * 45 + 40, 300);
            this.leaderboardContent.height = contentHeight;

            cc.log('[ResultSceneManager] 排行榜加載完成');
        }).catch((err) => {
            cc.error('[ResultSceneManager] 加載排行榜失敗:', err);
        });
    },
});

module.exports = ResultSceneManager;
