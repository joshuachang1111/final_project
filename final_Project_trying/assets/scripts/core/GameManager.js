/**
 * GameManager  (cc.Component 單例)
 * 掛在場景中「Managers」節點上，場景切換後仍存活。
 *
 * 職責：
 *   - 維護遊戲階段 (phase)、分數、剩餘時間
 *   - 持有所有 station 的參考表（供 PlayerController 互動時查找）
 *   - 透過 EventBus 廣播遊戲事件，不直接依賴 UI 或 Player
 */

const EventBus  = require('../core/EventBus');
const GridSystem = require('../core/GridSystem');

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

        this._phase    = Phase.LOBBY;
        this._score    = 0;
        this._timeLeft = this.totalTime;

        // stationId ("col,row") → StationBase component
        this._stations = {};

        // playerId (number) → PlayerController component
        this._players = {};
    },

    onDestroy() {
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
    },

    // ─────────────────────────────────────────────
    //  對外 API
    // ─────────────────────────────────────────────

    /** 開始一局遊戲 */
    startGame() {
        cc.log('[GameManager] startGame called');
        this._score    = 0;
        this._timeLeft = this.totalTime;
        this._phase    = Phase.PLAYING;

        cc.log('[GameManager] ✓ 初始化完成，timeLeft=', this._timeLeft, 'phase=', this._phase);
        EventBus.emit('game:start', { timeLeft: this._timeLeft });
        this.schedule(this._tick, 1);
        cc.log('[GameManager] ✓ 計時器已啟動');
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

    // ─────────────────────────────────────────────
    //  Getter
    // ─────────────────────────────────────────────

    get phase()    { return this._phase;    },
    get score()    { return this._score;    },
    get timeLeft() { return this._timeLeft; },

    // ─────────────────────────────────────────────
    //  內部
    // ─────────────────────────────────────────────

    _tick() {
        if (this._phase !== Phase.PLAYING) return;

        this._timeLeft -= 1;
        EventBus.emit('game:tick', { timeLeft: this._timeLeft });

        // 每 10 秒輸出一次日誌
        if (this._timeLeft % 10 === 0) {
            cc.log('[GameManager] _tick: timeLeft=', this._timeLeft);
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
        // 先轉場到 result 場景（讓 ResultSceneManager 初始化）
        // 然後再發出 game:end 事件（確保 ResultSceneManager 已準備好接收）
        cc.director.loadScene('result');
        this.scheduleOnce(() => {
            cc.log('[GameManager] 延遲後發出 game:end 事件，score=', this._score);
            EventBus.emit('game:end', { score: this._score });
        }, 0.5);
    },
});

module.exports = GameManager;
