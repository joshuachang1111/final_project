const LEVEL_SCENE_MAP = {
    susui:         'game',
    hansung:       'game',
    shuimu:        'game',
    fengyun:       'game',
    burger_battle: 'burger_battle',   // 漢堡組裝對抗模式
};

cc.Class({
    extends: cc.Component,

    properties: {
        scrollView: { default: null, type: cc.ScrollView },
    },

    onLoad() {
        cc.log('LevelSelectManager 已加載, role=', window._nmRole);

        // Guest 不能選關卡，要監聽 Host 開場後跟著切到 game scene。
        // Host 不訂閱（host 自己選關卡時 LevelSelectManager 內部已經 loadScene，
        // 再訂閱會在 nm.startGame() 的 _emit 收到一次重複觸發 double-nav）。
        if (window._nmRole === 'guest' && window._nm) {
            window._nm.on('start_game', this._onHostStartedGame, this);

            // Race-safe：Host 在 Guest 還在 Result→levelselect 轉場時就按下關卡，
            // 那次 emit 沒人訂閱會被吃掉。NM 把最後一次 code 2 資料 buffer 起來
            // 在 _lastStartGameData，這裡補拿一次。下一幀執行避免跟 onLoad 互卡。
            if (window._nm._lastStartGameData) {
                const buffered = window._nm._lastStartGameData;
                window._nm._lastStartGameData = null;   // consume once
                this.scheduleOnce(() => {
                    if (!this._navigated) this._onHostStartedGame(buffered);
                }, 0);
            }
        }
    },

    onDestroy() {
        if (window._nm) {
            window._nm.off('start_game', this._onHostStartedGame);
        }
    },

    start() {
        if (this.scrollView) {
            this.scheduleOnce(() => {
                this.scrollView.scrollToTop(0.1);
                if (this.scrollView.content) {
                    this.scrollView.content.y = 0;
                }
            }, 0);
        }
    },

    onLevelSelected(event, levelId) {
        // Guest 守門：點關卡無效，要等 Host 選
        if (window._nmRole === 'guest') {
            cc.log('[LevelSelectManager] Guest 不能選關卡，等待房主選擇...');
            return;
        }

        cc.log('【LevelSelectManager】onLevelSelected 被觸發，levelId=', levelId);
        window._selectedLevel = levelId;
        cc.sys.localStorage.setItem('selectedLevel', levelId);
        cc.sys.localStorage.setItem('playerRole', 'host');

        const nm = window._nm;
        const sceneName = LEVEL_SCENE_MAP[levelId];

        cc.log('【LevelSelectManager】nm=', nm ? '存在' : '不存在');
        if (nm) {
            cc.log('【LevelSelectManager】呼叫 nm.startGame(', levelId, ')');
            nm.startGame(levelId);
        }

        if (sceneName) {
            cc.log('【LevelSelectManager】Host 立即進遊戲');
            cc.director.loadScene(sceneName);
        }
    },

    _onHostStartedGame(msg) {
        // 防止 subscriber 跟 buffer 補拿同時 fire 造成 double-nav
        if (this._navigated) return;
        this._navigated = true;

        cc.log('[LevelSelectManager] Guest 收到 start_game, level=', msg.level);
        cc.sys.localStorage.setItem('selectedLevel', msg.level || 'susui');
        cc.sys.localStorage.setItem('playerRole', window._nmRole || 'guest');

        // 立即進遊戲（同步由 GameNetworkBridge 負責）
        const targetScene = LEVEL_SCENE_MAP[msg.level] || 'game';
        cc.log('[LevelSelectManager] Guest 立即進遊戲, scene=', targetScene);
        cc.director.loadScene(targetScene);
    },

    onBackBtn() {
        cc.director.loadScene('menu');
    },
});
