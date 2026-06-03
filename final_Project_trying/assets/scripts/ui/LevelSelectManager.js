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

        cc.log('【LevelSelectManager】onLevelSelected 被觸發，levelId=', levelId);
        this._selectedLevelId = levelId;
        window._selectedLevel = levelId;
        cc.sys.localStorage.setItem('selectedLevel', levelId);
        cc.sys.localStorage.setItem('playerRole', 'host');

        cc.log('【LevelSelectManager】✓ 已選擇關卡：', levelId, '，請點擊「確認開始遊戲」按鈕');
    },

    onConfirmStart: function() {
        cc.log('【LevelSelectManager】確認開始遊戲按鈕被點擊');

        if (!this._selectedLevelId) {
            cc.log('【LevelSelectManager】✗ 還沒選擇關卡');
            return;
        }

        const levelId = this._selectedLevelId;
        const sceneName = LEVEL_SCENE_MAP[levelId];
        const nm = window._nm;

        if (nm && sceneName) {
            cc.log('【LevelSelectManager】Host 通知 Guest 進遊戲，level=', levelId);

            // 通知 Guest 進遊戲
            nm.startGame(levelId);
            cc.log('【LevelSelectManager】nm.startGame 已呼叫');

            // 延遲進遊戲，確保 levelselect 完全加載
            this.scheduleOnce(() => {
                cc.log('【LevelSelectManager】延遲後進遊戲，場景名稱=', sceneName);
                cc.director.loadScene(sceneName);
            }, 0.3);
        } else if (sceneName) {
            cc.log('警告：NetworkManager 不存在，直接進遊戲');
            this.scheduleOnce(() => {
                cc.director.loadScene(sceneName);
            }, 0.3);
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
