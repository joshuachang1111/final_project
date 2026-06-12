# UI 與場景流程規格 (UI & Flow Spec)

## 完整場景切換流程

```
[menu]
  ↓ 點「多人遊戲」
[room]  (Photon 連線)
  ↓ 雙方 ready
[charselect]  ← 選角色 + 技能
  ↓ 確認
[levelselect]
  ↓ Host 選關卡，Guest 等待
[game] 或 [burger_battle]
  ↓ 遊戲結束
[result]  ← game 模式
  or
[menu]  ← burger_battle 暫時
```

---

## GuideOverlay

**檔案**：`assets/scripts/ui/GuideOverlay.js`  
**UUID**：`c635b5a6-293a-4e23-859a-684e46499131`（local，不可改）

### 行為
1. 監聽 `game:ready` → 顯示說明圖（`level1guide.png`）
2. Host 持續按住 Space → 進度環從 0 填到 100%（3 秒）
3. Host 完成：`GameManager.startGame()` + emit `guide:local_complete`
4. Guest 收到 `EV_GUIDE(15)` → `GameManager.startGame()`

### 進度環
```
RING_RADIUS = 22 px
RING_WIDTH  = 5 px
cc.Graphics 從頂端(-π/2) 順時針畫弧
```

---

## CharSelectManager

**檔案**：`assets/scripts/ui/CharSelectManager.js`

### 角色列表（CHARACTERS 陣列）
character-a 到 character-i（跳過 g）

### 技能列表（SKILLS 陣列）
```js
{ id:'skill_1', name:'清大熊貓', rarity:3, desc:'召喚一隻熊貓...',  icon:'skill_boar_icon'   }
{ id:'skill_2', name:'二退',     rarity:2, desc:'移除最舊的訂單...',icon:'skill_drop_icon'   }
{ id:'skill_3', name:'草皮大尖叫',rarity:4, desc:'所有人方向顛倒...',icon:'skill_scream_icon' }
{ id:'skill_4', name:'清交小徑', rarity:1, desc:'隨機傳送...',      icon:'skill_road_icon'   }
```

### 輸出
- `window._selectedCharacter`：'character-a' ~ 'character-i'
- `window._selectedSkill`：'skill_1' ~ 'skill_4'

### Highlight 機制
- `cc.Graphics` 畫邊框（`borderGfx.rect(...).stroke()`）
- Icon：80×80，position (0, h/2-50)
- icon tint：選中後設 `iconBg.color = cc.Color.WHITE`

---

## AudioManager

**檔案**：`assets/scripts/core/AudioManager.js`  
**生命**：`persistRootNode`（不隨場景銷毀）

### BGM 切換規則
```js
MENU_SCENES = new Set(['menu','room','charselect','levelselect','leaderboard'])
game:ready  → play 'bgm_menu'
game:start  → play 'bgm_game'
game:tick (timeLeft ≤ 30) → play 'bgm_urgent'
result 場景  → play 'bgm_result'（不循環）
```

### 音效路徑
- `resources/audio/bgm_menu`
- `resources/audio/bgm_game`
- `resources/audio/bgm_urgent`
- `resources/audio/bgm_result`

---

## LevelSelectManager

### 關卡 → 場景對照
```js
LEVEL_SCENE_MAP = {
    susui:         'game',
    hansung:       'game',
    shuimu:        'game',
    fengyun:       'game',
    burger_battle: 'burger_battle',
}
```

### Guest 導航守門
```js
// Guest 收到 start_game 廣播時
const targetScene = LEVEL_SCENE_MAP[msg.level] || 'game';
cc.director.loadScene(targetScene);
```

---

## BurgerBattleManager（UI 部分）

### HUD 佈局
```
左上：P1 分數（黃色）
右上：P2 分數（黃色）
中上：計時器（白色，MM:SS）
右上角：離開按鈕（紅色）
```

### 結算橫幅（`_showResultBanner`）
時間到後顯示 2.5 秒：
```
🏆 P1 獲勝！  P1:xxx  P2:xxx
```
或「P2 獲勝！」或「⚖ 平局！」
