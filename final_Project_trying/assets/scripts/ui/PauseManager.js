/**
 * PauseManager (cc.Component)
 * 掛在 game 場景中，管理暫停功能
 *
 * Inspector 需綁定：
 *   pausePanel      — cc.Node，暫停面板（預設 active = false）
 *   resumeBtn       — cc.Button，繼續遊戲
 *   replayBtn       — cc.Button，重玩一次
 *   menuBtn         — cc.Button，回主畫面
 */

const EventBus = require('../core/EventBus');

cc.Class({
    extends: cc.Component,

    properties: {
        pausePanel: {
            default: null,
            type: cc.Node,
            tooltip: '暫停面板',
        },
        resumeBtn: {
            default: null,
            type: cc.Button,
            tooltip: '繼續遊戲按鈕',
        },
        replayBtn: {
            default: null,
            type: cc.Button,
            tooltip: '重玩一次按鈕',
        },
        menuBtn: {
            default: null,
            type: cc.Button,
            tooltip: '回主畫面按鈕',
        },
        settingsBtn: {
            default: null,
            type: cc.Button,
            tooltip: '設定按鈕',
        },
    },

    onLoad() {
        cc.log('[PauseManager] onLoad');

        if (this.pausePanel) {
            this.pausePanel.active = false;
        }

        const isHost = window._nmRole !== 'guest';
        const isMultiplayer = !!window._nmRole;

        // 綁定按鈕事件
        if (this.resumeBtn) {
            // Guest 在多人模式下不能自己繼續
            if (!isHost && isMultiplayer) {
                this.resumeBtn.node.active = false;
            } else {
                this.resumeBtn.node.on('click', this._onResume, this);
            }
        }
        if (this.replayBtn) {
            // Guest 看不到重玩按鈕
            if (!isHost && isMultiplayer) {
                this.replayBtn.node.active = false;
            } else {
                this.replayBtn.node.on('click', this._onReplay, this);
            }
        }
        if (this.menuBtn) {
            this.menuBtn.node.on('click', this._onMenu, this);
        }
        if (this.settingsBtn) {
            this.settingsBtn.node.on('click', this._onSettings, this);
        }

        // 監聽鍵盤事件（只有 Host 或單機可以按 P 暫停）
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);

        // Guest 監聽 Host 廣播的暫停事件
        if (!isHost && isMultiplayer) {
            EventBus.on('game:remote_pause', this._onRemotePause, this);
        }

        cc.log('[PauseManager] 初始化完成，isHost=', isHost);
    },

    onDestroy() {
        if (cc.isValid(this.resumeBtn) && cc.isValid(this.resumeBtn.node)) {
            this.resumeBtn.node.off('click', this._onResume, this);
        }
        if (cc.isValid(this.replayBtn) && cc.isValid(this.replayBtn.node)) {
            this.replayBtn.node.off('click', this._onReplay, this);
        }
        if (cc.isValid(this.menuBtn) && cc.isValid(this.menuBtn.node)) {
            this.menuBtn.node.off('click', this._onMenu, this);
        }
        if (cc.isValid(this.settingsBtn) && cc.isValid(this.settingsBtn.node)) {
            this.settingsBtn.node.off('click', this._onSettings, this);
        }
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        EventBus.off('game:remote_pause', this._onRemotePause, this);
    },

    _onKeyDown(event) {
        if (event.keyCode !== cc.macro.KEY.p) return;
        // 多人模式下只有 Host 能暫停
        const isMultiplayer = !!window._nmRole;
        if (isMultiplayer && window._nmRole === 'guest') return;
        cc.log('[PauseManager] P 鍵按下，切換暫停');
        this.togglePause();
    },

    // ── 暫停/繼續 ────────────────────────

    togglePause() {
        if (!this.pausePanel) return;
        const isPaused = this.pausePanel.active;
        this.pausePanel.active = !isPaused;

        if (!isPaused) {
            cc.log('[PauseManager] ⏸ 遊戲暫停');
            cc.director.pause();
            EventBus.emit('game:pause');
            // 多人模式：Host 廣播暫停給 Guest
            if (window._nmRole === 'host') {
                EventBus.emit('game:local_pause', { paused: true });
            }
        } else {
            cc.log('[PauseManager] ▶ 遊戲繼續');
            cc.director.resume();
            EventBus.emit('game:resume');
            // 多人模式：Host 廣播繼續給 Guest
            if (window._nmRole === 'host') {
                EventBus.emit('game:local_pause', { paused: false });
            }
        }
    },

    /** Guest 收到 Host 的暫停廣播 */
    _onRemotePause(data) {
        if (!this.pausePanel) return;
        cc.log('[PauseManager] 收到 Host 暫停廣播 paused=', data.paused);
        this.pausePanel.active = data.paused;
        if (data.paused) {
            cc.director.pause();
        } else {
            cc.director.resume();
        }
    },

    _onResume() {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[PauseManager] 繼續遊戲');
        this.togglePause();
        this.scheduleOnce(() => { this._clicked = false; }, 0.3);
    },

    _onReplay() {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[PauseManager] 重玩一次');

        if (this.pausePanel && this.pausePanel.active) {
            cc.director.resume();
        }

        const isHost = window._nmRole !== 'guest';
        if (isHost && window._nm && typeof window._nm.sendResultChoice === 'function') {
            window._nm.sendResultChoice('replay');
        }

        // 保持 Photon 連線，直接進關卡選擇
        if (window._nm) window._nm._gameStarted = false;
        window._burgerBattleResult = null;
        window._gameScore = undefined;
        this.scheduleOnce(() => {
            cc.director.loadScene('levelselect');
        }, 0.3);
    },

    _onMenu() {
        if (this._clicked) return;
        this._clicked = true;
        cc.log('[PauseManager] 回主畫面');

        // 繼續遊戲後再切換場景
        if (this.pausePanel && this.pausePanel.active) {
            cc.director.resume();
        }

        const isHost = window._nmRole !== 'guest';
        if (isHost && window._nm && typeof window._nm.sendResultChoice === 'function') {
            window._nm.sendResultChoice('menu');
        }

        this.scheduleOnce(() => {
            if (window._nm && typeof window._nm.leaveRoom === 'function') {
                window._nm.leaveRoom();
            }
            EventBus.clear();
            cc.director.loadScene('menu');
        }, 0.3);
    },

    _onSettings() {
        cc.log('[PauseManager] 打開設定');
        const settingsManager = cc.find('Canvas/SettingsManager').getComponent('SettingsManager');
        if (settingsManager) {
            settingsManager.openSettings();
        } else {
            cc.warn('[PauseManager] 找不到 SettingsManager');
        }
    },
});
