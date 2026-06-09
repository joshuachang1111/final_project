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

    statics: { instance: null },

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

        // 第一幀場景已是 menu，直接播 menu BGM
        this._playBgm(BGM.MENU, true);
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
            // 進入遊戲場景：先播 bgm_game，等 game:start 才真正決定（已在 _onGameStart 處理）
            // 不在這裡播，避免 game:start 之前場景還在載入
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
