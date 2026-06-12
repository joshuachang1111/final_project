/**
 * GameManager  (cc.Component 單例)
 * 掛在場景中「Managers」節點上，場景切換後仍存活。
 *
 * 職責：
 *   - 維護遊戲階段 (phase)、分數、剩餘時間
 *   - 持有所有 station 的參考表（供 PlayerController 互動時查找）
 *   - 透過 EventBus 廣播遊戲事件，不直接依賴 UI 或 Player
 */

const EventBus     = require('../core/EventBus');
const GridSystem   = require('../core/GridSystem');
const AudioManager = require('../core/AudioManager');

/** 遊戲階段 */
const Phase = {
    LOBBY:   'lobby',
    PLAYING: 'playing',
    RESULT:  'result',
};

const GameManager = cc.Class({
    extends: cc.Component,

    statics: {
        instance: null,
        Phase,
    },

    properties: {
        /** 單局時間（秒） */
        totalTime: {
            default: 180,
            type: cc.Integer,
            tooltip: '單局倒數秒數',
        },
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        if (GameManager.instance) {
            this.destroy();
            return;
        }
        GameManager.instance = this;
        cc.game.addPersistRootNode(this.node);

        // BGM bootstrap：保險再 ensure 一次。MenuManager 通常已先 ensure，
        // debug 時直接 play game scene 也要有 BGM。
        AudioManager.ensure();

        this._phase    = Phase.LOBBY;
        this._score    = 0;
        this._timeLeft = this.totalTime;
        this._startTime  = null;  // wall-clock 起始時間（startGame 設定）
        this._pauseStart = null;  // 暫停起點（game:pause 設定）

        // stationId ("col,row") → StationBase component
        this._stations = {};

        // playerId (number) → PlayerController component
        this._players = {};

        // 監聽暫停/恢復：把暫停時間從 wall-clock elapsed 扣回去，避免
        // wall-clock 計時把 cc.director.pause() 期間誤算成有跑
        EventBus.on('game:pause',  this._onGamePause,  this);
        EventBus.on('game:resume', this._onGameResume, this);
    },

    onDestroy() {
        EventBus.off('game:pause',  this._onGamePause);
        EventBus.off('game:resume', this._onGameResume);
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
    },

    _onGamePause() {
        this._pauseStart = Date.now();
    },

    _onGameResume() {
        if (typeof this._pauseStart === 'number' && typeof this._startTime === 'number') {
            // 暫停整段時間往前推 _startTime，等同把這段 wall-clock 從 elapsed 扣掉
            this._startTime += Date.now() - this._pauseStart;
        }
        this._pauseStart = null;
    },

    // ─────────────────────────────────────────────
    //  對外 API
    // ─────────────────────────────────────────────

    /** 開始一局遊戲 */
    startGame() {
        this._score     = 0;
        this._timeLeft  = this.totalTime;
        this._startTime = Date.now();   // wall-clock 基準點，_tick 拿來算 elapsed
        this._pauseStart = null;
        this._phase     = Phase.PLAYING;

        // 若玩家未選技能，預設給熊貓技能
        if (!window._selectedSkill) window._selectedSkill = 'skill_1';

        EventBus.emit('game:start', { timeLeft: this._timeLeft });
        this.schedule(this._tick, 1);
    },

    /** 加分，並廣播最新分數 */
    addScore(points) {
        this._score += points;
        EventBus.emit('game:score', { score: this._score });
    },

    // ─────────────────────────────────────────────
    //  登記管理
    // ─────────────────────────────────────────────

    /** 由 StationBase.onLoad() 自動呼叫 */
    registerStation(col, row, stationComp) {
        this._stations[`${col},${row}`] = stationComp;
    },

    /** 由 PlayerController.onLoad() 自動呼叫 */
    registerPlayer(playerId, playerComp) {
        this._players[playerId] = playerComp;
    },

    /** 根據格子座標取得站台 component（找不到回傳 null） */
    getStation(col, row) {
        return this._stations[`${col},${row}`] || null;
    },

    /** 取得玩家 component */
    getPlayer(playerId) {
        return this._players[playerId] || null;
    },

    /** 取得所有已註冊的玩家 component 陣列 */
    getAllPlayers() {
        return Object.values(this._players).filter(p => p && cc.isValid(p.node));
    },

    // ─────────────────────────────────────────────
    //  Getter
    // ─────────────────────────────────────────────

    get phase()    { return this._phase;    },
    get score()    { return this._score;    },
    get timeLeft() { return this._timeLeft; },

    // 從 startGame 到現在「實際遊戲時間」（已扣掉暫停期間）的秒數。
    // 給訂單倒數共用，這樣訂單也吃同一條 wall-clock + pause 處理。
    get elapsed() {
        if (typeof this._startTime !== 'number') return 0;
        // 暫停中：時間凍結在 _pauseStart
        const endMs = typeof this._pauseStart === 'number' ? this._pauseStart : Date.now();
        return Math.max(0, (endMs - this._startTime) / 1000);
    },

    // ─────────────────────────────────────────────
    //  內部
    // ─────────────────────────────────────────────

    _tick() {
        if (this._phase !== Phase.PLAYING) return;

        // Wall-clock based：用 Date.now() 算 elapsed，不是每 tick -= 1。
        // 視窗最小化時 Cocos schedule 會暫停（_tick 不跑），但 Date.now() 還在走，
        // 視窗一恢復、_tick 第一次再被叫到，就自動把錯過的秒數補上。
        // 暫停（cc.director.pause）期間有 _pauseStart 紀錄，game:resume 已把 _startTime
        // 往前推扣掉，這裡不用特別處理。
        if (typeof this._startTime === 'number') {
            const elapsed = (Date.now() - this._startTime) / 1000;
            this._timeLeft = Math.max(0, this.totalTime - elapsed);
        } else {
            // Fallback：相容沒呼叫 startGame 就跑 _tick 的舊路徑
            this._timeLeft -= 1;
        }

        // HUD / 廣播都用 ceil 過的整數，否則 "2:59.5" 之類醜值會出現
        const displayed = Math.max(0, Math.ceil(this._timeLeft));
        EventBus.emit('game:tick', { timeLeft: displayed });

        if (displayed % 10 === 0) {
            cc.log('[GameManager] _tick: timeLeft=', displayed);
        }

        if (this._timeLeft <= 0) {
            cc.log('[GameManager] ✓ 時間到，呼叫 _endGame');
            this._endGame();
        }
    },

    _endGame() {
        this.unschedule(this._tick);
        this._phase = Phase.RESULT;
        GridSystem.reset();

        // 保存分數到全局變數，防止 scene 切換時丟失
        window._gameScore = this._score;
        cc.log('[GameManager] 保存分數到 window._gameScore=', this._score);

        // 發出事件給其他 scene（如果監聽者已準備好）
        EventBus.emit('game:end', { score: this._score });

        cc.director.loadScene('result');
    },
});

module.exports = GameManager;
