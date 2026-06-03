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

        if (this.leaderboardPanel) this.leaderboardPanel.active = false;

        // 綁定按鈕
        if (this.replayBtn) {
            this.replayBtn.node.on('click', this._onReplay, this);
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
        if (isHost && window._fbUser) {
            this._submitScore(data.score);
        }
    },

    _submitScore(score) {
        if (!LeaderboardManager._db) {
            LeaderboardManager.init();
        }

        const level = cc.sys.localStorage.getItem('selectedLevel') || 'unknown';
        const playerName = (window._fbUser && window._fbUser.displayName) || '訪客';
        const uid = (window._fbUser && window._fbUser.uid) || 'guest_' + Date.now();

        LeaderboardManager.submitScore({
            playerName: playerName,
            uid: uid,
            score: score,
            level: level,
        }).then(success => {
            if (success) {
                cc.log('[ResultSceneManager] 分數已上傳');
            }
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
        cc.log('[ResultSceneManager] 查看排行榜');
        if (this.leaderboardPanel) {
            this.leaderboardPanel.active = true;
            this._loadLeaderboard();
        }
    },

    onCloseLeaderboard() {
        if (this.leaderboardPanel) {
            this.leaderboardPanel.active = false;
        }
    },

    async _loadLeaderboard() {
        if (!LeaderboardManager._db) {
            LeaderboardManager.init();
        }

        cc.log('[ResultSceneManager] 加載排行榜');
        const leaderboard = await LeaderboardManager.fetchTopScores(10);

        if (!this.leaderboardContent) {
            cc.warn('[ResultSceneManager] leaderboardContent 未綁定');
            return;
        }

        // 清空舊的內容
        this.leaderboardContent.removeAllChildren();

        if (leaderboard.length === 0) {
            const emptyLabel = new cc.Node('empty');
            const label = emptyLabel.addComponent(cc.Label);
            label.string = '暫無記錄';
            emptyLabel.parent = this.leaderboardContent;
            return;
        }

        // 動態生成排行榜
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
    },
});

module.exports = ResultSceneManager;
