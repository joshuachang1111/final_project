/**
 * CharSelectManager  (cc.Component)
 * 選角色 / 選技能 場景管理器
 * 所有 UI 完全用程式建立，掛在 Canvas 節點上即可。
 *
 * 輸出：
 *   window._selectedCharacter  — 'character-a' ~ 'character-i'
 *   window._selectedSkill      — 'skill_1' ~ 'skill_4'
 */

// ── 角色清單（與 assets/resources/characters/ 檔名對應）─────
const CHARACTERS = [
    'character-a', 'character-b', 'character-c', 'character-d',
    'character-e', 'character-f', 'character-h', 'character-i',
];

// ── 技能清單 ───────────────────────────────────────────────
const SKILLS = [
    { id: 'skill_1', name: '清大熊貓', rarity: 3,
      desc: '召喚一隻熊貓在場地亂竄\n碰到玩家會將其推開\n持續 10 秒',
      icon: 'skill_boar_icon' },
    { id: 'skill_2', name: '二退', rarity: 2,
      desc: '移除最舊的訂單並立刻\n生成一張新訂單\n冷卻 20 秒',
      icon: 'skill_drop_icon' },
    { id: 'skill_3', name: '暴擊烹飪', rarity: 4,
      desc: '10% 機率烹飪時間減半\n暴擊時額外加 50 分',
      icon: null },
    { id: 'skill_4', name: '順手牽羊', rarity: 1,
      desc: '拾取食材時\n有 20% 機率額外獲得一份',
      icon: null },
];

// ── 版面常數 ───────────────────────────────────────────────
const W = 1440, H = 720;

// 頭像縮圖：從 256×256 portrait 裁切頭部區域
const THUMB_SIZE   = 90;      // 縮圖顯示大小
const FACE_RATIO   = 0.30;    // 臉佔整張圖的比例（上 30% ≒ 77px）
const FACE_OFFSET  = 0.0;     // 額外往上偏移比例（0 = 不偏移，負值 = 往上移）
const FACE_PX      = 256 * FACE_RATIO;        // 77px
const SPRITE_SCALE = THUMB_SIZE / FACE_PX;    // ≈ 1.17

// ── 顏色 ───────────────────────────────────────────────────
const COL_BG        = cc.color(18,  20,  40,  255);
const COL_PANEL     = cc.color(30,  35,  60,  240);
const COL_TAB_ON    = cc.color(80, 140, 255,  255);
const COL_TAB_OFF   = cc.color(50,  55,  90,  255);
const COL_SEL       = cc.color(255, 210,  50,  255);   // 選中框
const COL_CARD      = cc.color(45,  50,  85,  240);
const COL_CARD_SEL  = cc.color(80, 140, 255,  220);
const COL_CONFIRM   = cc.color(80, 200, 100,  255);
const COL_WHITE     = cc.color(255, 255, 255, 255);
const COL_GOLD      = cc.color(255, 200,  50, 255);
const COL_GREY      = cc.color(160, 160, 180, 255);

const CharSelectManager = cc.Class({
    extends: cc.Component,

    onLoad() {
        this._tab           = 'char';        // 'char' | 'skill'
        this._selCharIdx    = 0;
        this._selSkillIdx   = 0;
        this._charThumbNodes = [];
        this._skillCardNodes = [];
        this._portraitSprite = null;
        this._charPage      = null;
        this._skillPage     = null;

        // 讀取已存選擇（如有）
        if (window._selectedCharacter) {
            const idx = CHARACTERS.indexOf(window._selectedCharacter);
            if (idx >= 0) this._selCharIdx = idx;
        }
        if (window._selectedSkill) {
            const idx = SKILLS.findIndex(s => s.id === window._selectedSkill);
            if (idx >= 0) this._selSkillIdx = idx;
        }

        this._buildUI();
        this._loadPortrait(this._selCharIdx);
    },

    // ══════════════════════════════════════════
    //  UI 建立
    // ══════════════════════════════════════════

    _buildUI() {
        const root = this.node;
        root.color = cc.color(0, 0, 0, 255);   // 底色黑（背景圖載入前）

        // 背景圖
        cc.resources.load('charselect_bg', cc.Texture2D, (err, tex) => {
            if (!err && tex && cc.isValid(this.node)) {
                const bg = new cc.Node('bg');
                bg.setContentSize(W, H);
                bg.setPosition(0, 0);
                bg.zIndex = -10;
                const sp = bg.addComponent(cc.Sprite);
                sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = new cc.SpriteFrame(tex);
                root.addChild(bg);
            }
        });

        // 標題
        const title = _mkLabel('選擇角色與技能', 38, COL_GOLD);
        title.setPosition(0, H / 2 - 50);
        root.addChild(title);

        // Tab 按鈕
        this._tabCharBtn  = _mkBtn('角色', 140, 44, COL_TAB_ON,  () => this._switchTab('char'));
        this._tabSkillBtn = _mkBtn('技能', 140, 44, COL_TAB_OFF, () => this._switchTab('skill'));
        this._tabCharBtn .setPosition(-W / 2 + 100, H / 2 - 110);
        this._tabSkillBtn.setPosition(-W / 2 + 260, H / 2 - 110);
        root.addChild(this._tabCharBtn);
        root.addChild(this._tabSkillBtn);

        // 確認按鈕（固定顯示）
        const confirmBtn = _mkBtn('確  認', 180, 54, COL_CONFIRM, () => this._onConfirm());
        confirmBtn.setPosition(W / 2 - 130, -H / 2 + 60);
        root.addChild(confirmBtn);

        // 兩個內容頁
        this._charPage  = this._buildCharPage();
        this._skillPage = this._buildSkillPage();
        this._skillPage.active = false;
        root.addChild(this._charPage);
        root.addChild(this._skillPage);
    },

    // ── 角色頁 ─────────────────────────────────
    _buildCharPage() {
        const page = new cc.Node('CharPage');
        page.setContentSize(W, H);
        page.setPosition(0, 0);

        // 左側縮圖格（4 欄 × 2 列）
        const COLS = 4, ROWS = 2;
        const GAP  = 16;
        const gridW = COLS * THUMB_SIZE + (COLS - 1) * GAP;
        const startX = -W / 2 + 80 + THUMB_SIZE / 2;
        const startY = ROWS / 2 * (THUMB_SIZE + GAP) - (THUMB_SIZE + GAP) / 2;

        for (let i = 0; i < CHARACTERS.length; i++) {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const x = startX + col * (THUMB_SIZE + GAP);
            const y = startY - row * (THUMB_SIZE + GAP);

            const cell = this._buildThumbCell(i);
            cell.setPosition(x, y);
            page.addChild(cell);
            this._charThumbNodes.push(cell);
        }

        // 右側大頭照
        const portraitBg = _mkRect(280, 280, COL_PANEL);
        portraitBg.setPosition(W / 2 - 220, 20);
        page.addChild(portraitBg);

        // portrait sprite（用 mask 裁切）
        const portraitHolder = new cc.Node('PortraitHolder');
        portraitHolder.setContentSize(256, 256);
        portraitHolder.setPosition(W / 2 - 220, 20);
        const sp = portraitHolder.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        this._portraitSprite = sp;
        page.addChild(portraitHolder);

        // 角色名稱（右側下方）
        this._charNameLabel = _mkLabel('', 24, COL_GREY);
        this._charNameLabel.setPosition(W / 2 - 220, -H / 2 + 100);
        page.addChild(this._charNameLabel);

        this._refreshThumbHighlight();
        return page;
    },

    // 建單一縮圖格（含 Mask 裁臉）
    _buildThumbCell(idx) {
        const cell = new cc.Node(`thumb_${idx}`);
        cell.setContentSize(THUMB_SIZE, THUMB_SIZE);

        // 邊框背景
        const bg = _mkRect(THUMB_SIZE + 6, THUMB_SIZE + 6, COL_PANEL);
        cell.addChild(bg);

        // Mask 節點
        const maskNode = new cc.Node('mask');
        maskNode.setContentSize(THUMB_SIZE, THUMB_SIZE);
        maskNode.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
        cell.addChild(maskNode);

        // Portrait sprite（在 Mask 裡，偏移讓臉部置中）
        const sprNode = new cc.Node('spr');
        const scaledSize = 256 * SPRITE_SCALE;  // ≈ 299
        sprNode.setContentSize(scaledSize, scaledSize);
        // 正確計算：將臉部中心對齊 Mask 中心
        // 臉中心在 sprite local: scaledSize/2 - (FACE_PX/2)*SPRITE_SCALE
        const faceTopInSprite    = scaledSize / 2;                          // sprite 頂端
        const faceBottomInSprite = scaledSize / 2 - FACE_PX * SPRITE_SCALE; // 臉底部
        const faceCenterInSprite = (faceTopInSprite + faceBottomInSprite) / 2; // 臉中心
        const offsetY = FACE_OFFSET * scaledSize;   // 額外偏移（往上為正）
        sprNode.setPosition(0, -faceCenterInSprite + offsetY);
        const sp = sprNode.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        maskNode.addChild(sprNode);

        // 儲存 sprite ref 以便之後載入
        cell._portraitSprRef = sp;

        // 點擊事件
        cell.addComponent(cc.Button);
        cell.on(cc.Node.EventType.TOUCH_END, () => {
            this._selCharIdx = idx;
            this._refreshThumbHighlight();
            this._loadPortrait(idx);
        }, this);

        // 選中框（cc.Graphics 畫線，預設隱藏）
        const border = new cc.Node('border');
        border.setPosition(0, 0);
        border.active = false;
        const borderGfx = border.addComponent(cc.Graphics);
        borderGfx.strokeColor = COL_SEL;
        borderGfx.lineWidth = 4;
        borderGfx.rect(-(THUMB_SIZE / 2 + 3), -(THUMB_SIZE / 2 + 3), THUMB_SIZE + 6, THUMB_SIZE + 6);
        borderGfx.stroke();
        cell.addChild(border);

        // 載入縮圖 portrait
        const charId = CHARACTERS[idx];
        cc.resources.load(`characters/${charId}_portrait`, cc.Texture2D, (err, tex) => {
            if (err || !tex) return;
            sprNode.setContentSize(scaledSize, scaledSize);
            sp.spriteFrame = new cc.SpriteFrame(tex, new cc.Rect(0, 0, 256, 256));
        });

        return cell;
    },

    // ── 技能頁 ─────────────────────────────────
    _buildSkillPage() {
        const page = new cc.Node('SkillPage');
        page.setContentSize(W, H);
        page.setPosition(0, 0);

        const CARD_W = 280, CARD_H = 220;
        const GAP_X = 40, GAP_Y = 30;
        const startX = -(CARD_W + GAP_X / 2);
        const startY =  (CARD_H + GAP_Y) / 2;

        for (let i = 0; i < SKILLS.length; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = startX + col * (CARD_W + GAP_X) + CARD_W / 2;
            const y = startY - row * (CARD_H + GAP_Y);

            const card = this._buildSkillCard(i, CARD_W, CARD_H);
            card.setPosition(x, y);
            page.addChild(card);
            this._skillCardNodes.push(card);
        }

        this._refreshSkillHighlight();
        return page;
    },

    _buildSkillCard(idx, w, h) {
        const card = new cc.Node(`skill_${idx}`);
        card.setContentSize(w, h);

        const bg = _mkRect(w, h, COL_CARD);
        card.addChild(bg);

        const skill = SKILLS[idx];

        // 圖示區
        const iconBg = _mkRect(70, 70, cc.color(60, 70, 120, 255));
        iconBg.setPosition(0, h / 2 - 50);
        card.addChild(iconBg);

        if (skill.icon) {
            // _mkRect 已建好 cc.Sprite，直接取用，不能再 addComponent
            const iconSp = iconBg.getComponent(cc.Sprite);
            iconSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            iconBg.setContentSize(80, 80);
            iconBg.setPosition(0, h / 2 - 50);
            cc.resources.load(skill.icon, cc.Texture2D, (err, tex) => {
                if (!err && tex && cc.isValid(iconBg)) {
                    iconBg.color = cc.Color.WHITE;   // 清除深藍 tint，讓圖片原色顯示
                    iconSp.spriteFrame = new cc.SpriteFrame(tex);
                }
            });
        } else {
            const iconQ = _mkLabel('?', 32, COL_GREY);
            iconQ.setPosition(0, 0);
            iconBg.addChild(iconQ);
        }

        // 技能名
        const nameLabel = _mkLabel(skill.name, 22, COL_WHITE);
        nameLabel.setPosition(0, h / 2 - 110);
        card.addChild(nameLabel);

        // 稀有度星星
        const stars = _mkLabel('★'.repeat(skill.rarity) + '☆'.repeat(4 - skill.rarity), 18, COL_GOLD);
        stars.setPosition(0, h / 2 - 140);
        card.addChild(stars);

        // 描述
        const desc = _mkLabel(skill.desc, 15, COL_GREY);
        const descComp = desc.getComponent(cc.Label);
        if (descComp) {
            descComp.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
            descComp.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
            desc.width = w - 30;
        }
        desc.setPosition(0, h / 2 - 185);
        card.addChild(desc);

        // 選中框（cc.Graphics 畫線，預設隱藏）
        const border = new cc.Node('border');
        border.setPosition(0, 0);
        border.active = false;
        const bg2 = border.addComponent(cc.Graphics);
        bg2.strokeColor = COL_SEL;
        bg2.lineWidth = 5;
        bg2.rect(-(w / 2 + 4), -(h / 2 + 4), w + 8, h + 8);
        bg2.stroke();
        card.addChild(border);

        card.addComponent(cc.Button);
        card.on(cc.Node.EventType.TOUCH_END, () => {
            this._selSkillIdx = idx;
            this._refreshSkillHighlight();
        }, this);

        return card;
    },

    // ══════════════════════════════════════════
    //  動態載入 Portrait（右側大圖）
    // ══════════════════════════════════════════

    _loadPortrait(idx) {
        const charId = CHARACTERS[idx];
        cc.resources.load(`characters/${charId}_portrait`, cc.Texture2D, (err, tex) => {
            if (err || !this._portraitSprite) {
                cc.warn('[CharSelect] 載入 portrait 失敗:', charId, err);
                return;
            }
            this._portraitSprite.spriteFrame = new cc.SpriteFrame(
                tex, new cc.Rect(0, 0, 256, 256)
            );
            this._portraitSprite.node.setContentSize(256, 256);
        });
    },

    // ══════════════════════════════════════════
    //  Tab 切換
    // ══════════════════════════════════════════

    _switchTab(tab) {
        this._tab = tab;
        this._charPage.active  = (tab === 'char');
        this._skillPage.active = (tab === 'skill');
        this._tabCharBtn .color = tab === 'char'  ? COL_TAB_ON : COL_TAB_OFF;
        this._tabSkillBtn.color = tab === 'skill' ? COL_TAB_ON : COL_TAB_OFF;
    },

    // ══════════════════════════════════════════
    //  Highlight 刷新
    // ══════════════════════════════════════════

    _refreshThumbHighlight() {
        this._charThumbNodes.forEach((cell, i) => {
            const border = cell.getChildByName('border');
            if (border) border.active = (i === this._selCharIdx);
        });
    },

    _refreshSkillHighlight() {
        this._skillCardNodes.forEach((card, i) => {
            const border = card.getChildByName('border');
            if (border) border.active = (i === this._selSkillIdx);
        });
    },

    // ══════════════════════════════════════════
    //  確認
    // ══════════════════════════════════════════

    _onConfirm() {
        window._selectedCharacter = CHARACTERS[this._selCharIdx];
        window._selectedSkill     = SKILLS[this._selSkillIdx].id;
        cc.log('[CharSelect] 確認選擇:', window._selectedCharacter, window._selectedSkill);
        cc.director.loadScene('menu');
    },
});

module.exports = CharSelectManager;

// ══════════════════════════════════════════
//  工具函式
// ══════════════════════════════════════════

function _mkLabel(str, fontSize, color) {
    const node  = new cc.Node();
    const label = node.addComponent(cc.Label);
    label.string          = str;
    label.fontSize        = fontSize;
    label.lineHeight      = fontSize + 4;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign   = cc.Label.VerticalAlign.CENTER;
    node.color = color || cc.Color.WHITE;
    return node;
}

function _mkRect(w, h, color) {
    const node = new cc.Node();
    node.setContentSize(w, h);
    const sp = node.addComponent(cc.Sprite);
    sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    node.color = color || cc.Color.WHITE;
    return node;
}

function _mkBtn(text, w, h, bgColor, cb) {
    const node = new cc.Node();
    node.setContentSize(w, h);

    const bg = node.addComponent(cc.Sprite);
    bg.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    node.color = bgColor;

    const label = _mkLabel(text, 20, COL_WHITE);
    label.setPosition(0, 0);
    node.addChild(label);

    node.addComponent(cc.Button);
    node.on(cc.Node.EventType.TOUCH_END, cb);
    return node;
}
