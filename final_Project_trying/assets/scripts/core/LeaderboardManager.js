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
        cc.log('[LeaderboardManager] 開始初始化...');
        cc.log('[LeaderboardManager] typeof firebase=', typeof firebase);

        if (typeof firebase === 'undefined') {
            cc.error('[LeaderboardManager] Firebase SDK 未載入');
            return false;
        }

        cc.log('[LeaderboardManager] typeof firebase.firestore=', typeof firebase.firestore);
        if (typeof firebase.firestore === 'undefined') {
            cc.error('[LeaderboardManager] Firestore SDK 未載入，請確保 firebase-firestore-compat.js 已加入');
            return false;
        }

        try {
            this._db = firebase.firestore();
            cc.log('[LeaderboardManager] Firestore 初始化成功，_db=', !!this._db);
            return true;
        } catch (err) {
            cc.error('[LeaderboardManager] 初始化失敗:', err.message);
            return false;
        }
    },

    /**
     * 上傳玩家分數到 Firestore
     * @param {Object} scoreData { playerName, uid, score, level }
     * @returns {Promise} true 或 false
     */
    submitScore(scoreData) {
        cc.log('[LeaderboardManager] submitScore called:', scoreData);

        if (!this._db) {
            cc.error('[LeaderboardManager] ✗ Firestore 未初始化！');
            return Promise.resolve(false);
        }

        const { playerName = '訪客', uid, score, level } = scoreData;

        if (!uid) {
            cc.error('[LeaderboardManager] ✗ uid 遺失！', scoreData);
            return Promise.resolve(false);
        }
        if (score === undefined || score === null) {
            cc.error('[LeaderboardManager] ✗ score 無效！', scoreData);
            return Promise.resolve(false);
        }
        if (!level) {
            cc.error('[LeaderboardManager] ✗ level 遺失！', scoreData);
            return Promise.resolve(false);
        }

        cc.log('[LeaderboardManager] ✓ 數據驗證通過，準備上傳:', { playerName, uid, score, level });

        const docId = `${uid}_${Date.now()}`;
        cc.log('[LeaderboardManager] 文件 ID:', docId);

        return this._db.collection('leaderboard').doc(docId).set({
            name: playerName,
            uid: uid,
            score: Number(score),
            level: level,
            timestamp: new Date(),
        })
            .then(() => {
                cc.log('[LeaderboardManager] ✓✓ 分數上傳成功！文件 ID:', docId);
                return true;
            })
            .catch((err) => {
                cc.error('[LeaderboardManager] ✗✗ 上傳失敗:', err.code, err.message);
                return false;
            });
    },

    /**
     * 取得前 N 名排行榜
     * @param {number} limit 前幾名（預設 10）
     * @returns {Promise} 排行榜陣列，每項 { rank, name, score, level }
     */
    fetchTopScores(limit = 10) {
        cc.log('[LeaderboardManager] fetchTopScores called, _db=', !!this._db);
        if (!this._db) {
            cc.error('[LeaderboardManager] Firestore 未初始化，無法讀取排行榜');
            return Promise.resolve([]);
        }

        cc.log('[LeaderboardManager] 開始查詢前', limit, '名...');

        return this._db.collection('leaderboard')
            .get()
            .then((snapshot) => {
                cc.log('[LeaderboardManager] 查詢完成，文件數=', snapshot.size);

                const leaderboard = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    cc.log('[LeaderboardManager] 文件:', data);
                    leaderboard.push({
                        name: data.name || '訪客',
                        score: (typeof data.score === 'number') ? data.score : 0,
                        level: data.level || 'unknown',
                    });
                });

                leaderboard.sort((a, b) => b.score - a.score);

                const topScores = leaderboard.slice(0, limit).map((item, index) => ({
                    rank: index + 1,
                    ...item
                }));

                cc.log('[LeaderboardManager] 取得排行榜:', JSON.stringify(topScores));
                return topScores;
            })
            .catch((err) => {
                cc.error('[LeaderboardManager] 查詢失敗:', err.message, err.code);
                return [];
            });
    },

    /**
     * 取得單個玩家的最高分（可選功能）
     */
    getPlayerBestScore(uid) {
        if (!this._db || !uid) return Promise.resolve(null);

        return this._db.collection('leaderboard')
            .where('uid', '==', uid)
            .orderBy('score', 'desc')
            .limit(1)
            .get()
            .then((snapshot) => {
                if (snapshot.empty) return null;
                const doc = snapshot.docs[0];
                return doc.data();
            })
            .catch((err) => {
                cc.error('[LeaderboardManager] 查詢玩家分數失敗:', err.message);
                return null;
            });
    },
};

module.exports = LeaderboardManager;
