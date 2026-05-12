/**
 * EventBus
 * 全域事件匯流排，讓各模組可以在不直接互相依賴的情況下溝通。
 *
 * 用法：
 *   const EventBus = require('../core/EventBus');
 *
 *   // 訂閱
 *   EventBus.on('player:moved', this._onPlayerMoved, this);
 *
 *   // 發送
 *   EventBus.emit('player:moved', { playerId: 1, col: 3, row: 2 });
 *
 *   // 取消訂閱（組件銷毀時一定要呼叫）
 *   EventBus.off('player:moved', this._onPlayerMoved);
 *
 * 事件命名規則： 'system:action'
 *   player:moved    player:pickup    player:drop
 *   station:place   station:pickup   station:cook_done
 *   order:added     order:completed  order:expired
 *   game:start      game:tick        game:end
 */

const _listeners = {};

const EventBus = {

    /**
     * 訂閱事件
     * @param {string}   event
     * @param {Function} callback
     * @param {object}   [ctx]     callback 的 this 綁定
     */
    on(event, callback, ctx) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push({ callback, ctx: ctx || null });
    },

    /**
     * 取消訂閱
     * @param {string}   event
     * @param {Function} callback
     */
    off(event, callback) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(l => l.callback !== callback);
    },

    /**
     * 發送事件
     * @param {string} event
     * @param {*}      [data]
     */
    emit(event, data) {
        const list = _listeners[event];
        if (!list) return;
        // 複製一份，防止 callback 內部 off() 影響目前迭代
        list.slice().forEach(l => l.callback.call(l.ctx, data));
    },

    /**
     * 清除指定事件的所有監聽（換場景時使用）
     * 不傳參數則清除全部
     */
    clear(event) {
        if (event) delete _listeners[event];
        else       Object.keys(_listeners).forEach(k => delete _listeners[k]);
    },
};

module.exports = EventBus;
