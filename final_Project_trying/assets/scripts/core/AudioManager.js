/**
 * AudioManager  (cc.Component 單例, persistRootNode)
 * 掛在 menu.fire 的 AudioManager 節點上。
 *
 * BGM 規則：
 *   非遊戲場景（menu / room / charselect / levelselect）→ bgm_menu（切換場景不重播）
 *   game 場景開始  → bgm_game
 *   遊戲倒數 ≤ 30s → bgm_urgent
 *   result 場景    → bgm_result（不循環）
 */

const EventBus = require('./EventBus');

// resources/audio/ 底下的檔名（不含副檔名）
const BGM = {
    MENU:   'audio/bgm_menu',
    GAME:   'audio/bgm_game',
    URGENT: 'audio/bgm_urgent',
    RESULT: 'audio/bgm_result',
};

// 哪些場景屬於「menu 類型」（共用 bgm_menu）
const MENU_SCENES = new Set(['menu', 'room', 'charselect', 'levelselect', 'leaderboard']);

const AudioManager = cc.Class({
    extends: cc.Component,

    statics: {
        instance: null,

        // Self-bootstrap：場景檔（menu.fire）裡沒掛 AudioManager 節點時，由
        // MenuManager / GameManager 之類的早期 onLoad 呼叫，動態建立一個節點
        // addComponent，AudioManager 自己的 onLoad 會 addPersistRootNode。
        // 已存在則直接回傳，重複呼叫安全。
        ensure() {
            if (AudioManager.instance) return AudioManager.instance;
            const scene = cc.director.getScene();
            if (!scene) return null;
            const node = new cc.Node('AudioManager');
            scene.addChild(node);
            return node.addComponent(AudioManager);
        },
    },

    onLoad() {
        if (AudioManager.instance) {
            this.destroy();
            return;
        }
        AudioManager.instance = this;
        cc.game.addPersistRootNode(this.node);

        this._currentKey  = null;   // 目前播放的 BGM key（BGM.* 其中之一）
        this._urgentDone  = false;  // 這局是否已切換過 urgent

        // 監聽場景切換
        cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, this._onSceneChanged, this);

        // 監聽遊戲事件
        EventBus.on('game:start', this._onGameStart, this);
        EventBus.on('game:tick',  this._onGameTick,  this);

        // 第一首 BGM 改用 _onSceneChanged 邏輯（依當前場景決定），避免之前 hardcode
        // MENU：若 ensure() 是在 game 場景才呼叫，會錯誤播 menu BGM 直到 game:start。
        this._onSceneChanged();
    },

    onDestroy() {
        cc.director.off(cc.Director.EVENT_AFTER_SCENE_LAUNCH, this._onSceneChanged, this);
        EventBus.off('game:start', this._onGameStart, this);
        EventBus.off('game:tick',  this._onGameTick,  this);
        if (AudioManager.instance === this) AudioManager.instance = null;
    },

    // ══════════════════════════════════════════
    //  場景切換
    // ══════════════════════════════════════════

    _onSceneChanged() {
        const scene = cc.director.getScene();
        if (!scene) return;
        const name = scene.name;
        cc.log('[AudioManager] 場景切換至:', name);

        if (name === 'game') {
            // 進 game 場景立刻切 bgm_game，guide 階段也吃 game BGM。
            // EVENT_AFTER_SCENE_LAUNCH 觸發時場景已 launched，可以安全播。
            // game:start 之後 _onGameStart 會再呼叫一次，但 _playBgm 內已防重播。
            this._playBgm(BGM.GAME, true);
        } else if (name === 'result') {
            this._playBgm(BGM.RESULT, false);   // 結算不循環
        } else if (MENU_SCENES.has(name)) {
            // 只有目前不在播 menu BGM 才重新播（避免切換 room→charselect 時中斷）
            if (this._currentKey !== BGM.MENU) {
                this._playBgm(BGM.MENU, true);
            }
        }
    },

    // ══════════════════════════════════════════
    //  遊戲事件
    // ══════════════════════════════════════════

    _onGameStart() {
        this._urgentDone = false;
        this._playBgm(BGM.GAME, true);
    },

    _onGameTick(data) {
        if (this._urgentDone) return;
        if (typeof data.timeLeft === 'number' && data.timeLeft <= 30) {
            this._urgentDone = true;
            this._playBgm(BGM.URGENT, true);
        }
    },

    // ══════════════════════════════════════════
    //  核心播放
    // ══════════════════════════════════════════

    _playBgm(key, loop) {
        // 已經在播同一首就不打斷
        if (this._currentKey === key && cc.audioEngine.isMusicPlaying()) return;

        this._currentKey = key;
        cc.resources.load(key, cc.AudioClip, (err, clip) => {
            if (err || !clip) {
                cc.warn('[AudioManager] 載入失敗:', key, err);
                return;
            }
            // 再次確認：載入期間可能已切到別首
            if (this._currentKey !== key) return;
            cc.audioEngine.playMusic(clip, loop);
            cc.log('[AudioManager] 播放:', key, '| loop:', loop);
        });
    },

    // ══════════════════════════════════════════
    //  對外 API
    // ══════════════════════════════════════════

    setVolume(vol) {
        cc.audioEngine.setMusicVolume(Math.max(0, Math.min(1, vol)));
    },

    stop() {
        cc.audioEngine.stopMusic();
        this._currentKey = null;
    },
});

module.exports = AudioManager;
