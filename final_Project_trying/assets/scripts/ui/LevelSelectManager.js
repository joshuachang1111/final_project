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
        cc.log('LevelSelectManager 已加載');
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
        cc.log('【LevelSelectManager】onLevelSelected 被觸發，levelId=', levelId);
        window._selectedLevel = levelId;
        cc.sys.localStorage.setItem('selectedLevel', levelId);
        cc.sys.localStorage.setItem('playerRole', 'host');

        const nm = window._nm;
        cc.log('【LevelSelectManager】nm=', nm ? '存在' : '不存在');
        if (nm) {
            cc.log('【LevelSelectManager】呼叫 nm.startGame(', levelId, ')');
            nm.startGame(levelId);
            const sceneName = LEVEL_SCENE_MAP[levelId];
            if (sceneName) {
                this.scheduleOnce(() => {
                    cc.director.loadScene(sceneName);
                }, 0.5);
            }
        } else {
            cc.log('警告：NetworkManager 不存在，直接進遊戲');
            const sceneName = LEVEL_SCENE_MAP[levelId];
            if (sceneName) {
                this.scheduleOnce(() => {
                    cc.director.loadScene(sceneName);
                }, 0.5);
            }
        }
    },

    onBackBtn() {
        cc.director.loadScene('menu');
    },
});
