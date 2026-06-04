/**
 * InputHandler  (cc.Component 單例)
 * 掛在「Managers」節點上。
 *
 * 職責：
 *   - 監聽鍵盤事件，維護「按住」與「剛按下」狀態
 *   - 將實體按鍵對應到抽象 Action，讓 PlayerController 不需知道按了哪個鍵
 *   - 同時支援兩名玩家的按鍵配置
 *
 * 設計原則：
 *   - Action 是語意單元（MOVE_UP、INTERACT），不是按鍵名稱
 *   - 按鍵配置集中在這一個地方，未來換鍵只改這裡
 *
 * Player 1：WASD 移動 + F 互動
 * Player 2：方向鍵移動 + Space 互動
 */

/** 所有可用的抽象操作 */
const Action = {
    MOVE_UP:    'MOVE_UP',
    MOVE_DOWN:  'MOVE_DOWN',
    MOVE_LEFT:  'MOVE_LEFT',
    MOVE_RIGHT: 'MOVE_RIGHT',
    INTERACT:   'INTERACT',
    SKILL:      'SKILL',
};

/**
 * 按鍵綁定表
 * 值為 cc.macro.KEY 中的常數，在 onLoad 中初始化以確保 cc 已就緒
 */
let BINDINGS = null;

function buildBindings() {
    return {
        1: {
            [Action.MOVE_UP]:    cc.macro.KEY.w,
            [Action.MOVE_DOWN]:  cc.macro.KEY.s,
            [Action.MOVE_LEFT]:  cc.macro.KEY.a,
            [Action.MOVE_RIGHT]: cc.macro.KEY.d,
            [Action.INTERACT]:   cc.macro.KEY.f,
            [Action.SKILL]:      cc.macro.KEY.e,
        },
        2: {
            [Action.MOVE_UP]:    cc.macro.KEY.w,
            [Action.MOVE_DOWN]:  cc.macro.KEY.s,
            [Action.MOVE_LEFT]:  cc.macro.KEY.a,
            [Action.MOVE_RIGHT]: cc.macro.KEY.d,
            [Action.INTERACT]:   cc.macro.KEY.f,
            [Action.SKILL]:      cc.macro.KEY.e,
        },
    };
}

const InputHandler = cc.Class({
    extends: cc.Component,

    statics: {
        instance: null,
        Action,
    },

    // ─────────────────────────────────────────────
    //  生命週期
    // ─────────────────────────────────────────────

    onLoad() {
        if (InputHandler.instance) {
            this.destroy();
            return;
        }
        InputHandler.instance = this;
        cc.game.addPersistRootNode(this.node);

        BINDINGS = buildBindings();

        // _held[keyCode]     = 目前是否按住
        // _justDown[keyCode] = 這一幀是否剛按下（lateUpdate 清除）
        this._held     = {};
        this._justDown = {};

        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);
    },

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);
        if (InputHandler.instance === this) InputHandler.instance = null;
    },

    lateUpdate() {
        // 每幀結束後清除「剛按下」狀態
        this._justDown = {};
    },

    // ─────────────────────────────────────────────
    //  對外 API
    // ─────────────────────────────────────────────

    /**
     * 目前是否按住此 Action（適合連續移動）
     * @param {number} playerId  1 or 2
     * @param {string} action    Action.*
     */
    isHeld(playerId, action) {
        const keyCode = this._keyCode(playerId, action);
        return keyCode !== undefined ? !!this._held[keyCode] : false;
    },

    /**
     * 這一幀是否剛按下此 Action（適合一次性操作，如互動）
     * @param {number} playerId
     * @param {string} action
     */
    isJustPressed(playerId, action) {
        const keyCode = this._keyCode(playerId, action);
        return keyCode !== undefined ? !!this._justDown[keyCode] : false;
    },

    // ─────────────────────────────────────────────
    //  內部
    // ─────────────────────────────────────────────

    _keyCode(playerId, action) {
        return BINDINGS && BINDINGS[playerId] && BINDINGS[playerId][action];
    },

    _onKeyDown(event) {
        const kc = event.keyCode;
        if (!this._held[kc]) this._justDown[kc] = true;
        this._held[kc] = true;
    },

    _onKeyUp(event) {
        this._held[event.keyCode] = false;
    },
});

module.exports = InputHandler;
