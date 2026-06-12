/**
 * GuideOverlay  (cc.Component)
 * 遊戲開始前顯示關卡說明圖，Host 長按空白鍵 3 秒後遊戲才真正開始。
 *
 * 流程：
 *   game:ready → 顯示 overlay
 *   Host 長按 space 3s → 隱藏 overlay → GameManager.startGame() → 廣播 guide:local_complete
 *   Guest 收到 guide:remote_complete → 隱藏 overlay → GameManager.startGame()
 *
 * 編輯器設定（見下方「使用說明」）：
 *   - guideTexture：拖入 assets/img/level1/level1guide（Texture2D）
 */

const EventBus    = require('../core/EventBus');
const GameManager = require('../core/GameManager');

const HOLD_DURATION = 3.0;    // 需長按幾秒
const RING_RADIUS   = 22;     // 進度圓圈半徑（px）
const RING_WIDTH    = 5;      // 圓圈線寬
const IMG_SIZE      = 580;    // 說明圖顯示大小（原圖 2048×2048，等比顯示不變形）

const IMG_MAX_W     = 760;
const IMG_MAX_H     = 580;

const GuideOverlay = cc.Class({
    extends: cc.Component,

    properties: {
        guideTexture: {
            default: null,
            type: cc.Texture2D,
            tooltip: '拖入 level1guide 的 Texture2D',
        },
    },

    onLoad() {
        this._holdTimer  = 0;
        this._spaceHeld  = false;
        this._started    = false;

        // 確保蓋在所有遊戲節點上面
        this.node.zIndex = 200;

        this._buildUI();

        EventBus.on('game:ready',           this._onGameReady,      this);
        EventBus.on('guide:remote_complete', this._onRemoteComplete, this);

        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);

        // 預設隱藏，等 game:ready 才顯示
        this.node.active = false;
    },

    onDestroy() {
        EventBus.off('game:ready',           this._onGameReady,      this);
        EventBus.off('guide:remote_complete', this._onRemoteComplete, this);

        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);
    },

    // ══════════════════════════════════════════
    //  UI 建立
    // ══════════════════════════════════════════

    _buildUI() {
        const W = 1440, H = 720;

        // 半透明黑底（讓背後遊戲場景隱約可見）
        const bgNode = new cc.Node('bg');
        bgNode.setPosition(0, 0);
        const gfxBg = bgNode.addComponent(cc.Graphics);
        gfxBg.fillColor = cc.color(0, 0, 0, 160);
        gfxBg.rect(-W / 2, -H / 2, W, H);
        gfxBg.fill();
        this.node.addChild(bgNode);

        // 關卡說明圖（正方形等比顯示，不變形）
        this._imgNode = new cc.Node('guideImage');
        this._imgNode.setPosition(0, 50);
        const imgSp = this._imgNode.addComponent(cc.Sprite);
        imgSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        if (this.guideTexture) {
            imgSp.spriteFrame = new cc.SpriteFrame(this.guideTexture);
            this._setGuideImageSize(this.guideTexture);
        } else {
            this._imgNode.setContentSize(IMG_SIZE, IMG_SIZE);
        }
        this.node.addChild(this._imgNode);

        // 進度圓圈（圖片下方）
        const ringNode = new cc.Node('ring');
        ringNode.setPosition(0, -268);
        this._gfx = ringNode.addComponent(cc.Graphics);
        this.node.addChild(ringNode);
        this._drawRing(0);

        // 提示文字
        this._instrNode = new cc.Node('instruction');
        const lbl = this._instrNode.addComponent(cc.Label);
        lbl.string            = '';
        lbl.fontSize          = 20;
        lbl.lineHeight        = 24;
        lbl.horizontalAlign   = cc.Label.HorizontalAlign.CENTER;
        this._instrNode.color = cc.color(255, 255, 255, 200);
        this._instrNode.setPosition(0, -310);
        this.node.addChild(this._instrNode);
    },

    // ══════════════════════════════════════════
    //  進度圓圈繪製
    // ══════════════════════════════════════════

    _setGuideImageSize(texture) {
        const texW = texture.width || IMG_SIZE;
        const texH = texture.height || IMG_SIZE;
        const scale = Math.min(IMG_MAX_W / texW, IMG_MAX_H / texH);

        this._imgNode.setContentSize(texW * scale, texH * scale);
    },

    _drawRing(progress) {
        const g = this._gfx;
        g.clear();

        // 背景灰圓（全圈）
        g.strokeColor = cc.color(255, 255, 255, 60);
        g.lineWidth   = RING_WIDTH;
        g.circle(0, 0, RING_RADIUS);
        g.stroke();

        // 白色進度弧（從頂部順時針填充）
        if (progress > 0.01) {
            g.strokeColor = cc.color(255, 255, 255, 255);
            g.lineWidth   = RING_WIDTH;
            const endAngle = -Math.PI / 2 + progress * 2 * Math.PI;
            g.arc(0, 0, RING_RADIUS, -Math.PI / 2, endAngle, false);
            g.stroke();
        }
    },

    // ══════════════════════════════════════════
    //  事件處理
    // ══════════════════════════════════════════

    _onGameReady() {
        this.node.active = true;
        const isHost = window._nmRole !== 'guest';
        const lbl = this._instrNode.getComponent(cc.Label);
        if (lbl) lbl.string = isHost ? '長按空白鍵開始' : '等待開始...';
    },

    _onKeyDown(e) {
        if (e.keyCode === cc.macro.KEY.space) this._spaceHeld = true;
    },

    _onKeyUp(e) {
        if (e.keyCode !== cc.macro.KEY.space) return;
        this._spaceHeld = false;
        this._holdTimer = 0;
        this._drawRing(0);
    },

    update(dt) {
        if (!this.node.active || this._started) return;

        // 只有 Host（或單機）才能長按開始
        const isHost = window._nmRole !== 'guest';
        if (!isHost) return;

        if (this._spaceHeld) {
            this._holdTimer = Math.min(this._holdTimer + dt, HOLD_DURATION);
            this._drawRing(this._holdTimer / HOLD_DURATION);

            if (this._holdTimer >= HOLD_DURATION) {
                this._hostComplete();
            }
        }
    },

    // Host 長按完成
    _hostComplete() {
        if (this._started) return;
        this._started = true;
        this.node.active = false;
        if (GameManager.instance) GameManager.instance.startGame();
        EventBus.emit('guide:local_complete');   // Bridge 收到後廣播 EV_GUIDE 給 Guest
        cc.log('[GuideOverlay] Host 完成長按，遊戲開始');
    },

    // Guest 收到 Host 廣播
    _onRemoteComplete() {
        if (this._started) return;
        this._started = true;
        this.node.active = false;
        if (GameManager.instance) GameManager.instance.startGame();
        cc.log('[GuideOverlay] Guest 收到 guide 完成，遊戲開始');
    },
});

module.exports = GuideOverlay;
