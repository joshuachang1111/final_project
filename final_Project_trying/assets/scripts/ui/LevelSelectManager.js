const LEVEL_SCENE_MAP = {
    susui:   'game',
    hansung: 'game',
    shuimu:  'game',
    fengyun: 'game',
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

        // 防止重複點擊
        if (this._levelSelected) {
            cc.log('[LevelSelectManager] 已經選過關卡，忽略重複點擊');
            return;
        }
        this._levelSelected = true;

        cc.log('【LevelSelectManager】onLevelSelected 被觸發，levelId=', levelId);
        window._selectedLevel = levelId;
        cc.sys.localStorage.setItem('selectedLevel', levelId);
        cc.sys.localStorage.setItem('playerRole', 'host');

        const nm = window._nm;
        const sceneName = LEVEL_SCENE_MAP[levelId];

        if (nm && sceneName) {
            cc.log('【LevelSelectManager】Host 呼叫 nm.startGame');

            // 先通知 Guest 進遊戲
            nm.startGame(levelId);
            cc.log('【LevelSelectManager】nm.startGame 已呼叫');

            // 在下一幀進遊戲（避免場景加載衝突，同時 GameNetworkBridge 會確保同時開始）
            this.scheduleOnce(() => {
                cc.director.loadScene(sceneName);
                cc.log('【LevelSelectManager】Host 進遊戲');
            }, 0);
        } else if (sceneName) {
            cc.log('警告：NetworkManager 不存在，直接進遊戲');
            this.scheduleOnce(() => {
                cc.director.loadScene(sceneName);
            }, 0);
        } else {
            cc.error('錯誤：找不到場景名稱，levelId=', levelId);
        }
    },

    _onHostStartedGame(msg) {
        cc.log('[LevelSelectManager] Guest 收到 start_game, level=', msg.level);
        cc.sys.localStorage.setItem('selectedLevel', msg.level || 'susui');
        cc.sys.localStorage.setItem('playerRole', window._nmRole || 'guest');
        cc.director.loadScene('game');
    },

    onBackBtn() {
        cc.director.loadScene('menu');
    },
});
