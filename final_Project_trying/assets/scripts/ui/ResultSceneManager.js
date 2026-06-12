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

const LEVEL_SCENE_MAP = {
    susui:   'game',
    hansung: 'game2',
    shuimu:  'game',
    fengyun: 'game',
};

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
        cc.log('[ResultSceneManager] 診斷: isHost=', isHost, ', _nmRole=', window._nmRole);

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
        cc.log('[ResultSceneManager] 已註冊 game:end 事件監聽');

        // 檢查是否有保存的分數（來自 GameManager）
        if (window._gameScore !== undefined) {
            cc.log('[ResultSceneManager] 從 window._gameScore 獲取分數=', window._gameScore);
            this._onGameEnd({ score: window._gameScore });
        }

        // Guest 訂閱 Host 的 result 選擇 + start_game 兜底，否則 Host 按再玩一次
        // 之後這邊只是 log「Code 4 收到」但沒人接，Guest 永遠卡在 result scene。
        if (!isHost && window._nm) {
            window._nm.on('host_result_choice', this._onHostChoice, this);
            // Fallback: 如果 code 4 已經處理過、但 Guest 還沒切到 levelselect
            // 之前 Host 就先按關卡了，至少能直接補進遊戲。
            window._nm.on('start_game', this._onStartGameFallback, this);
        }
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

        if (window._nm) {
            window._nm.off('host_result_choice', this._onHostChoice);
            window._nm.off('start_game', this._onStartGameFallback);
        }
    },

    // ── 遊戲結束 ──────────────────────────────────

    _onGameEnd(data) {
        cc.log('[ResultSceneManager] 遊戲結束，分數:', data && data.score);

        // 顯示分數
        if (this.scoreLabel) {
            const bbr = window._burgerBattleResult;
            // 背景獎狀文字密集，scoreLabel 改放獎狀外上方黑邊 (y=330)，
            // 並把字色從黑換成白（原本黑字在黑邊上看不見）。
            this.scoreLabel.node.color = cc.color(255, 255, 255, 255);
            this.scoreLabel.node.y = 330;
            this.scoreLabel.node.zIndex = 100;

            if (bbr) {
                // ── 漢堡對抗模式 ──
                // 標題（勝負）放獎狀上方；P1/P2 兩個分數拆成獨立 label
                // 分別放在獎狀左右兩側黑邊。
                let header;
                if      (bbr.winner === 'P1')   header = '🏆 P1 獲勝！';
                else if (bbr.winner === 'P2')   header = '🏆 P2 獲勝！';
                else                             header = '⚖ 平局！';
                this.scoreLabel.string = header;
                this.scoreLabel.lineHeight = 60;

                this._buildBBSideScores(bbr);
            } else {
                // ── 一般遊戲模式 ──
                this.scoreLabel.string = (data && data.score !== undefined)
                    ? data.score + ' 分'
                    : '-- 分';
            }
        }

        // Host 才上傳分數到排行榜（burger_battle 模式不上傳）
        const isHost = window._nmRole !== 'guest';
        const isBurgerBattle = !!window._burgerBattleResult;
        cc.log('[ResultSceneManager] 診斷:');
        cc.log('  - window._nmRole=', window._nmRole);
        cc.log('  - isHost=', isHost);
        cc.log('  - window._fbUser=', !!window._fbUser);

        if (isHost && window._fbUser && !isBurgerBattle) {
            cc.log('[ResultSceneManager] ✓ 條件滿足，呼叫 _submitScore');
            this._submitScore(data.score);
        } else {
            cc.log('[ResultSceneManager] ✗ 不上傳（burger_battle 或條件不滿足）');
        }
    },

    // BB 模式：把 P1 / P2 分數分別放在獎狀左右黑邊（獎狀本體 960×640 居中於 1440×720 canvas，
    // 左右各有約 240px 寬黑邊空白）。獲勝那邊用黃色強調。
    _buildBBSideScores(bbr) {
        const canvas = this.scoreLabel.node.parent;
        if (!canvas) return;

        // 清掉上一輪的（重玩進 result 時 _onGameEnd 會再次跑）
        if (this._bbP1Node && cc.isValid(this._bbP1Node)) this._bbP1Node.destroy();
        if (this._bbP2Node && cc.isValid(this._bbP2Node)) this._bbP2Node.destroy();

        const winColor  = cc.color(255, 220, 60, 255);   // 黃
        const normColor = cc.color(255, 255, 255, 255);  // 白

        const mk = (text, x, color) => {
            const node = new cc.Node('BBSideScore');
            const lbl  = node.addComponent(cc.Label);
            lbl.string           = text;
            lbl.fontSize         = 44;
            lbl.lineHeight       = 56;
            lbl.horizontalAlign  = cc.Label.HorizontalAlign.CENTER;
            node.color           = color;
            node.setPosition(x, 0);
            node.zIndex          = 100;
            canvas.addChild(node);
            return node;
        };

        this._bbP1Node = mk(`P1\n${bbr.p1Score} 分`, -590, bbr.winner === 'P1' ? winColor : normColor);
        this._bbP2Node = mk(`P2\n${bbr.p2Score} 分`,  590, bbr.winner === 'P2' ? winColor : normColor);
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

    // ── Guest 收到 Host 的選擇 ───────────────────────────

    _onHostChoice(msg) {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[ResultSceneManager] Guest 收到 host 選擇:', msg.choice);
        if (msg.choice === 'replay') {
            if (window._nm) window._nm._gameStarted = false;
            EventBus.clear();
            cc.director.loadScene('levelselect');
        } else {
            // menu
            if (window._nm && typeof window._nm.leaveRoom === 'function') {
                window._nm.leaveRoom();
            }
            EventBus.clear();
            cc.director.loadScene('menu');
        }
    },

    // Fallback: Guest 還沒切到 levelselect，Host 就已經按關卡了。
    // 直接補進 game scene，selectedLevel 用 NM 傳來的。
    _onStartGameFallback(msg) {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[ResultSceneManager] Guest 從 result 直接補進 game, level=', msg.level);
        const levelId = msg.level || 'susui';
        const sceneName = LEVEL_SCENE_MAP[levelId] || 'game';
        cc.sys.localStorage.setItem('selectedLevel', levelId);
        cc.sys.localStorage.setItem('playerRole', window._nmRole || 'guest');
        EventBus.clear();
        cc.director.loadScene(sceneName);
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
                itemNode.height = 50;

                const label = itemNode.addComponent(cc.Label);

                // 簡化格式：排名. 玩家名 - 難度 - 分數
                label.string = `${item.rank}. ${item.name}  -  ${item.level}  -  ${item.score}分`;
                label.fontSize = 18;
                label.lineHeight = 50;
                label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;

                // 設定字體顏色為黑色
                itemNode.color = cc.color(0, 0, 0, 255);

                itemNode.parent = this.leaderboardContent;
                // 頂部留 60px 的空間，避免被卷周切掉
                itemNode.y = -(index * 55 + 60);
            });

            // 增加頂部 padding，總高度 = 60 + 每項高度
            const contentHeight = Math.max(60 + leaderboard.length * 55 + 40, 400);
            this.leaderboardContent.height = contentHeight;

            cc.log('[ResultSceneManager] 排行榜加載完成');
        }).catch((err) => {
            cc.error('[ResultSceneManager] 加載排行榜失敗:', err);
        });
    },
});

module.exports = ResultSceneManager;
