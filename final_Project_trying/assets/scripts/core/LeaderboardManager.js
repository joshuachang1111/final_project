/**
 * LeaderboardManager  (單例)
 * 負責與 Firebase Firestore 互動，上傳玩家分數、讀取排行榜
 *
 * Collection: leaderboard
 * Document 格式：{ name, uid, score, level, timestamp }
 */

const LeaderboardManager = {
    _db: null,

    /**
     * 初始化 Firestore 連線
     * 需要先確保 Firebase 已初始化（firebase.initializeApp 已呼叫）
     */
    init() {
        if (typeof firebase === 'undefined') {
            cc.error('[LeaderboardManager] Firebase SDK 未載入');
            return false;
        }
        if (typeof firebase.firestore === 'undefined') {
            cc.error('[LeaderboardManager] Firestore SDK 未載入，請確保 firebase-firestore-compat.js 已加入');
            return false;
        }
        this._db = firebase.firestore();
        cc.log('[LeaderboardManager] Firestore 初始化成功');
        return true;
    },

    /**
     * 上傳玩家分數到 Firestore
     * @param {Object} scoreData { playerName, uid, score, level }
     */
    async submitScore(scoreData) {
        if (!this._db) {
            cc.warn('[LeaderboardManager] Firestore 未初始化，無法提交分數');
            return false;
        }

        const { playerName = '訪客', uid, score, level } = scoreData;

        if (!uid || score === undefined || !level) {
            cc.error('[LeaderboardManager] 分數數據不完整', scoreData);
            return false;
        }

        try {
            cc.log('[LeaderboardManager] 上傳分數:', { playerName, score, level });

            // 用 uid + timestamp 作為 doc ID，確保同一玩家多局都能記錄
            const docId = `${uid}_${Date.now()}`;
            await this._db.collection('leaderboard').doc(docId).set({
                name: playerName,
                uid: uid,
                score: score,
                level: level,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });

            cc.log('[LeaderboardManager] 分數上傳成功');
            return true;
        } catch (err) {
            cc.error('[LeaderboardManager] 上傳失敗:', err.message);
            return false;
        }
    },

    /**
     * 取得前 N 名排行榜
     * @param {number} limit 前幾名（預設 10）
     * @returns {Array} 排行榜陣列，每項 { rank, name, score, level }
     */
    async fetchTopScores(limit = 10) {
        if (!this._db) {
            cc.warn('[LeaderboardManager] Firestore 未初始化，無法讀取排行榜');
            return [];
        }

        try {
            cc.log('[LeaderboardManager] 查詢前', limit, '名...');

            const snapshot = await this._db.collection('leaderboard')
                .orderBy('score', 'desc')
                .limit(limit)
                .get();

            const leaderboard = [];
            snapshot.forEach((doc, index) => {
                const data = doc.data();
                leaderboard.push({
                    rank: index + 1,
                    name: data.name || '訪客',
                    score: data.score,
                    level: data.level,
                });
            });

            cc.log('[LeaderboardManager] 取得排行榜:', leaderboard);
            return leaderboard;
        } catch (err) {
            cc.error('[LeaderboardManager] 查詢失敗:', err.message);
            return [];
        }
    },

    /**
     * 取得單個玩家的最高分（可選功能）
     */
    async getPlayerBestScore(uid) {
        if (!this._db || !uid) return null;

        try {
            const snapshot = await this._db.collection('leaderboard')
                .where('uid', '==', uid)
                .orderBy('score', 'desc')
                .limit(1)
                .get();

            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return doc.data();
        } catch (err) {
            cc.error('[LeaderboardManager] 查詢玩家分數失敗:', err.message);
            return null;
        }
    },
};

module.exports = LeaderboardManager;
