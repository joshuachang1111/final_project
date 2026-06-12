/**
 * SettingsManager (cc.Component)
 * 管理設定頁面（可在 menu 或 pause 中使用）
 *
 * Inspector 需綁定：
 *   settingsPanel    — cc.Node，設定面板（預設 active = false）
 *   closeBtn         — cc.Button，關閉按鈕
 *   masterVolumeSlider — cc.Slider，主音量（可選）
 *   musicVolumeSlider  — cc.Slider，音樂音量（可選）
 *   sfxVolumeSlider    — cc.Slider，音效音量（可選）
 */

cc.Class({
    extends: cc.Component,

    properties: {
        settingsPanel: {
            default: null,
            type: cc.Node,
            tooltip: '設定面板',
        },
        closeBtn: {
            default: null,
            type: cc.Button,
            tooltip: '關閉按鈕',
        },
        masterVolumeSlider: {
            default: null,
            type: cc.Slider,
            tooltip: '主音量滑塊',
        },
        musicVolumeSlider: {
            default: null,
            type: cc.Slider,
            tooltip: '音樂音量滑塊',
        },
        sfxVolumeSlider: {
            default: null,
            type: cc.Slider,
            tooltip: '音效音量滑塊',
        },
        hiddenElementsOnOpen: {
            default: [],
            type: [cc.Node],
            tooltip: '打開設定時要隱藏的元素（可留空自動隱藏所有除了settingsPanel）',
        },
    },

    onLoad() {
        cc.log('[SettingsManager] onLoad');

        // 強制確保設定面板在開始時是隱藏的
        if (this.settingsPanel) {
            this.settingsPanel.active = false;
            cc.log('[SettingsManager] 設定面板已設置為隱藏');
        } else {
            cc.warn('[SettingsManager] 找不到 settingsPanel，請在 Inspector 中綁定！');
        }

        // 綁定關閉按鈕
        if (this.closeBtn) {
            this.closeBtn.node.on('click', this._onClose, this);
        }

        // 記錄原本的狀態
        this._elementStates = new Map();

        // 初始化音量設定（從 localStorage 讀取）
        this._initAudioSettings();
    },

    onDestroy() {
        if (cc.isValid(this.closeBtn) && cc.isValid(this.closeBtn.node)) {
            this.closeBtn.node.off('click', this._onClose, this);
        }
    },

    // ── 開啟/關閉設定 ────────────────────────

    /**
     * 從菜單或暫停畫面打開設定
     */
    openSettings() {
        if (this.settingsPanel) {
            this.settingsPanel.active = true;
            cc.log('[SettingsManager] 打開設定頁面');

            // 隱藏其他元素
            this._hideOtherElements();

            // 記錄打開設定前的暫停狀態
            this._wasGamePausedBefore = cc.director.isPaused();
            cc.log('[SettingsManager] 打開設定前的暫停狀態:', this._wasGamePausedBefore);

            // 如果遊戲沒有暫停，就暫停遊戲
            if (!this._wasGamePausedBefore && cc.director.getRunningScene().name === 'game') {
                cc.director.pause();
                cc.log('[SettingsManager] 遊戲已暫停');
            }
        }
    },

    _onClose() {
        cc.log('[SettingsManager] _onClose 被調用');

        if (this._clicked) {
            cc.log('[SettingsManager] 按鈕被連續點擊，忽略');
            return;
        }

        this._clicked = true;
        cc.log('[SettingsManager] 關閉設定頁面');

        if (this.settingsPanel) {
            this.settingsPanel.active = false;
            cc.log('[SettingsManager] 設定面板已隱藏');
        } else {
            cc.warn('[SettingsManager] 找不到 settingsPanel！');
        }

        // 恢復其他元素
        this._showOtherElements();

        // 只在打開設定前遊戲沒有暫停時，才恢復遊戲
        // 這樣從 pause 打開設定時，關閉設定後會回到 pause 狀態
        if (!this._wasGamePausedBefore && cc.director.getRunningScene().name === 'game') {
            cc.director.resume();
            cc.log('[SettingsManager] 遊戲已繼續');
        } else {
            cc.log('[SettingsManager] 遊戲保持暫停狀態（從暫停中打開的設定）');
        }

        this.scheduleOnce(() => {
            this._clicked = false;
        }, 0.3);
    },

    // ── 隱藏/顯示其他元素 ────────────────────────

    _hideOtherElements() {
        const canvas = this.node.parent;
        if (!canvas) return;

        // 如果指定了要隱藏的元素，就隱藏它們
        if (this.hiddenElementsOnOpen && this.hiddenElementsOnOpen.length > 0) {
            this.hiddenElementsOnOpen.forEach((element) => {
                if (cc.isValid(element)) {
                    // 記錄原本的狀態
                    this._elementStates.set(element.uuid, element.active);
                    element.active = false;
                }
            });
            cc.log('[SettingsManager] 已隱藏指定元素');
        } else {
            // 否則自動隱藏除了 settingsPanel 以外的所有子節點
            canvas.children.forEach((child) => {
                if (child !== this.settingsPanel && child !== this.node) {
                    // 記錄原本的狀態
                    this._elementStates.set(child.uuid, child.active);
                    child.active = false;
                }
            });
            cc.log('[SettingsManager] 已隱藏所有菜單元素');
        }
    },

    _showOtherElements() {
        const canvas = this.node.parent;
        if (!canvas) return;

        // 恢復隱藏的元素到原本狀態
        if (this.hiddenElementsOnOpen && this.hiddenElementsOnOpen.length > 0) {
            this.hiddenElementsOnOpen.forEach((element) => {
                if (cc.isValid(element)) {
                    // 恢復原本的狀態
                    const wasActive = this._elementStates.get(element.uuid);
                    element.active = wasActive !== undefined ? wasActive : true;
                }
            });
            cc.log('[SettingsManager] 已恢復指定元素到原本狀態');
        } else {
            // 恢復所有子節點到原本狀態
            canvas.children.forEach((child) => {
                if (child !== this.settingsPanel && child !== this.node) {
                    // 恢復原本的狀態
                    const wasActive = this._elementStates.get(child.uuid);
                    child.active = wasActive !== undefined ? wasActive : true;
                }
            });
            cc.log('[SettingsManager] 已恢復所有菜單元素到原本狀態');
        }

        // 清空記錄
        this._elementStates.clear();
    },

    // ── 音量設定 ────────────────────────

    _initAudioSettings() {
        // 從 localStorage 讀取保存的音量設定
        const masterVolume = parseFloat(cc.sys.localStorage.getItem('masterVolume')) || 1.0;
        const musicVolume = parseFloat(cc.sys.localStorage.getItem('musicVolume')) || 1.0;
        const sfxVolume = parseFloat(cc.sys.localStorage.getItem('sfxVolume')) || 1.0;

        // 設定滑塊的初始值
        if (this.masterVolumeSlider) {
            this.masterVolumeSlider.progress = masterVolume;
            this.masterVolumeSlider.node.on('slide', this._onMasterVolumeChange, this);
            this._addSliderLabel(this.masterVolumeSlider, '主音量');
        }

        if (this.musicVolumeSlider) {
            this.musicVolumeSlider.progress = musicVolume;
            this.musicVolumeSlider.node.on('slide', this._onMusicVolumeChange, this);
            this._addSliderLabel(this.musicVolumeSlider, '音樂');
        }

        if (this.sfxVolumeSlider) {
            this.sfxVolumeSlider.progress = sfxVolume;
            this.sfxVolumeSlider.node.on('slide', this._onSfxVolumeChange, this);
            this._addSliderLabel(this.sfxVolumeSlider, '音效');
        }

        cc.log('[SettingsManager] 音量設定初始化完成', { masterVolume, musicVolume, sfxVolume });
    },

    // 在 slider 左側掛上一個說明文字 label（runtime 建立，不用動 scene 檔）。
    // 用深色字 + 白色 outline，確保深色 / 淺色背景都看得清。
    _addSliderLabel(slider, text) {
        if (!slider || !slider.node) return;
        if (slider.node.getChildByName('SliderLabel')) return; // 已存在不重複建

        const labelNode = new cc.Node('SliderLabel');
        labelNode.parent = slider.node;
        labelNode.zIndex = 10;

        const lbl = labelNode.addComponent(cc.Label);
        lbl.string         = text;
        lbl.fontSize       = 32;
        lbl.lineHeight     = 36;
        lbl.horizontalAlign = cc.Label.HorizontalAlign.RIGHT;
        lbl.verticalAlign   = cc.Label.VerticalAlign.CENTER;

        labelNode.color = cc.color(40, 40, 40, 255);
        if (cc.LabelOutline) {
            const outline = labelNode.addComponent(cc.LabelOutline);
            outline.color = cc.color(255, 255, 255, 255);
            outline.width = 2;
        }

        // 放在 slider 左側（距離 slider 左緣再外推 110，避免跟滑塊重疊）
        const halfW = (slider.node.width || 200) / 2;
        labelNode.setAnchorPoint(1, 0.5);
        labelNode.x = -halfW - 20;
        labelNode.y = 0;
    },

    _onMasterVolumeChange(slider) {
        const volume = slider.progress;
        cc.sys.localStorage.setItem('masterVolume', volume.toString());

        // 應用到主音量（如果有音頻管理器）
        if (window.AudioManager) {
            window.AudioManager.setMasterVolume(volume);
        }

        cc.log('[SettingsManager] 主音量已修改:', volume);
    },

    _onMusicVolumeChange(slider) {
        const volume = slider.progress;
        cc.sys.localStorage.setItem('musicVolume', volume.toString());

        if (window.AudioManager) {
            window.AudioManager.setMusicVolume(volume);
        }

        cc.log('[SettingsManager] 音樂音量已修改:', volume);
    },

    _onSfxVolumeChange(slider) {
        const volume = slider.progress;
        cc.sys.localStorage.setItem('sfxVolume', volume.toString());

        if (window.AudioManager) {
            window.AudioManager.setFxVolume(volume);
        }

        cc.log('[SettingsManager] 音效音量已修改:', volume);
    },
});
