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

            // ── 跳過按鈕（右上角）────────────────────────────
            this._buildSkipBtn(overlay, finish);
        });
    },

    /** 強制 HTML5 video 元素使用 object-fit:fill（Stretch）*/
    _forceStretch(vp) {
        try {
            // CC 2.4.x 內部 video 元素掛在 vp._video 或 vp._videoPlayer._video
            const el = (vp._video) || (vp._videoPlayer && vp._videoPlayer._video);
            if (el && el.style) {
                el.style.objectFit = 'fill';
                el.style.width     = '100%';
                el.style.height    = '100%';
            }
        } catch(e) {
            // native 平台無此 API，忽略
        }
    },

    /** 建立跳過按鈕（右上角） */
    _buildSkipBtn(parent, onSkip) {
        const btn = new cc.Node('SkipBtn');
        btn.setContentSize(110, 38);
        btn.setPosition(W / 2 - 68, H / 2 - 26);
        btn.zIndex = 2;
        btn.color  = cc.color(0, 0, 0, 180);

        const bg = btn.addComponent(cc.Sprite);
        bg.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        const lblNode = new cc.Node('Lbl');
        const lbl     = lblNode.addComponent(cc.Label);
        lbl.string             = '跳過  ▶';
        lbl.fontSize           = 18;
        lbl.horizontalAlign    = cc.Label.HorizontalAlign.CENTER;
        lbl.verticalAlign      = cc.Label.VerticalAlign.CENTER;
        lblNode.color          = cc.Color.WHITE;
        btn.addChild(lblNode);

        btn.addComponent(cc.Button);
        btn.on(cc.Node.EventType.TOUCH_END, onSkip, this);

        parent.addChild(btn);
    },

    /** 強制停止並清除（換場景前可呼叫） */
    stop() {
        if (this._overlayNode && cc.isValid(this._overlayNode)) {
            this._overlayNode.destroy();
        }
        this._overlayNode = null;
    },
};

module.exports = VideoManager;
