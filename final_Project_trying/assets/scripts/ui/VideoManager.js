/**
 * VideoManager  (全域工具模組，不掛節點)
 *
 * 在任何場景的 Canvas 上疊加全螢幕影片，播完或按跳過後執行 callback。
 *
 * 用法：
 *   const VideoManager = require('./VideoManager');
 *   VideoManager.play('bigin_video', () => cc.director.loadScene('room'));
 *
 * 影片檔放在 assets/resources/{name}.mp4
 * Stretch 模式：影片撐滿 1440×720，不保留長寬比（keepAspectRatio = false）。
 */

const W = 1440, H = 720;

const VideoManager = {

    _overlayNode: null,

    /**
     * 播放影片 overlay。
     * @param {string}   resourcePath  assets/resources 下的路徑（不含副檔名）
     * @param {Function} onComplete    播完或跳過後呼叫
     */
    play(resourcePath, onComplete) {
        // 防止重複播放
        if (this._overlayNode && cc.isValid(this._overlayNode)) {
            cc.warn('[VideoManager] 已有影片在播放，忽略本次呼叫');
            return;
        }

        // 影片播放期間關掉背景音樂。
        // stop() 同時清除 _currentKey，等到 room 場景載入時
        // AudioManager._onSceneChanged 會偵測到 menu 場景並自動重新播 bgm_menu。
        const AudioManager = require('../core/AudioManager');
        if (AudioManager.instance) {
            AudioManager.instance.stop();
        }

        const canvas = cc.find('Canvas');
        if (!canvas) {
            cc.warn('[VideoManager] 找不到 Canvas，直接執行 callback');
            onComplete && onComplete();
            return;
        }

        // ── 建立全螢幕遮罩層 ──────────────────────────────────
        const overlay = new cc.Node('VideoOverlay');
        overlay.setContentSize(W, H);
        overlay.setPosition(0, 0);
        overlay.zIndex = 9999;
        canvas.addChild(overlay);
        this._overlayNode = overlay;

        let _done = false;
        const finish = () => {
            if (_done) return;
            _done = true;
            this._removeSkipBtn();           // 清掉 DOM 按鈕
            if (cc.isValid(overlay)) overlay.destroy();
            this._overlayNode = null;
            onComplete && onComplete();
        };

        // ── 載入 VideoClip ────────────────────────────────────
        cc.resources.load(resourcePath, cc.VideoClip, (err, clip) => {
            if (err || !clip) {
                cc.error('[VideoManager] 載入影片失敗:', resourcePath, err);
                finish();
                return;
            }
            if (!cc.isValid(overlay)) return;  // overlay 已被提前銷毀

            // ── 黑色底板（video 元素出現前不閃白）─────────────
            const bgNode = new cc.Node('VideoBg');
            bgNode.setContentSize(W, H);
            bgNode.color = cc.Color.BLACK;
            const bgSp = bgNode.addComponent(cc.Sprite);
            bgSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            bgNode.zIndex = 0;
            overlay.addChild(bgNode);

            // ── VideoPlayer 節點 ──────────────────────────────
            const vidNode = new cc.Node('VideoNode');
            vidNode.setContentSize(W, H);
            vidNode.setPosition(0, 0);
            vidNode.zIndex = 1;
            overlay.addChild(vidNode);

            const vp = vidNode.addComponent(cc.VideoPlayer);
            vp.resourceType  = cc.VideoPlayer.ResourceType.LOCAL;
            vp.clip          = clip;
            vp.keepAspectRatio = false;   // Stretch：撐滿畫面，不留黑邊
            vp.isFullScreen  = false;
            vp.playOnAwake   = false;

            // 播完 / 出錯 → finish
            vidNode.on('completed', finish, this);
            vidNode.on('error', () => {
                cc.error('[VideoManager] 影片播放錯誤');
                finish();
            }, this);

            // ready-to-play 後才 play（確保 seek 完成）
            vidNode.on('ready-to-play', () => {
                // Web 平台補強：強制 object-fit:fill 讓影片真正撐滿
                this._forceStretch(vp);
                vp.play();
            }, this);

            // 某些平台不發 ready-to-play，直接呼叫也安全
            vp.play();

            // ── 跳過按鈕：HTML DOM 元素，才能蓋過 VideoPlayer DOM ──
            this._buildSkipBtn(finish);
        });
    },

    /** 強制 HTML5 video 元素使用 object-fit:fill（Stretch）*/
    _forceStretch(vp) {
        try {
            const el = (vp._video) || (vp._videoPlayer && vp._videoPlayer._video);
            if (el && el.style) {
                el.style.objectFit = 'fill';
                el.style.width     = '100%';
                el.style.height    = '100%';
            }
        } catch(e) { /* native 平台無此 API，忽略 */ }
    },

    /**
     * 用原生 DOM 建跳過按鈕。
     * cc.VideoPlayer 在 web 上是 HTML 元素，會蓋住所有 Cocos 節點；
     * 只有同樣是 DOM 元素並設更高 z-index 才能顯示在影片上方。
     */
    _buildSkipBtn(onSkip) {
        if (typeof document === 'undefined') return;  // 非 web 平台

        const btn = document.createElement('div');
        btn.id = 'vm-skip-btn';
        btn.textContent = '跳過  ▶';
        btn.style.cssText = [
            'position:fixed',
            'top:46px',
            'right:20px',
            'z-index:999999',
            'padding:6px 18px',
            'background:rgba(0,0,0,0.65)',
            'color:#fff',
            'font-size:18px',
            'font-family:sans-serif',
            'cursor:pointer',
            'border-radius:4px',
            'border:1px solid rgba(255,255,255,0.35)',
            'user-select:none',
            '-webkit-user-select:none',
        ].join(';');

        const handler = () => {
            this._removeSkipBtn();
            onSkip();
        };
        btn.addEventListener('click',    handler);
        btn.addEventListener('touchend', handler);

        document.body.appendChild(btn);
        this._skipBtnEl = btn;
    },

    /** DOM 跳過按鈕清除 */
    _removeSkipBtn() {
        if (this._skipBtnEl) {
            try { this._skipBtnEl.parentNode.removeChild(this._skipBtnEl); } catch(e) {}
            this._skipBtnEl = null;
        }
    },

    /** 強制停止並清除（換場景前可呼叫） */
    stop() {
        this._removeSkipBtn();
        if (this._overlayNode && cc.isValid(this._overlayNode)) {
            this._overlayNode.destroy();
        }
        this._overlayNode = null;
    },
};

module.exports = VideoManager;
