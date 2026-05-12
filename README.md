# 清大版 Overcooked — Final Project (Group 14)

> 以清華大學各學餐為場景的多人合作料理遊戲，玩家扮演學餐打工學生，在時限內完成料理訂單。

---

## 專案結構

```
final_project_trying/
├── README.md                        ← 本檔案
└── final_Project_trying/            ← Cocos Creator 2.4.8 專案根目錄
    ├── project.json
    ├── assets/
    │   ├── img/                     ← 所有圖片素材
    │   │   ├── background.png       960×640，程式生成，對齊 80px 格子
    │   │   ├── red_guy.png          玩家1 sprite sheet（320×320，4×4 幀）
    │   │   ├── white_guy.png        玩家2 sprite sheet（320×320，4×4 幀）
    │   │   ├── stove.png            火爐（160×160）
    │   │   ├── cutting board.png    砧板（160×160）
    │   │   ├── food_box.png         食材箱（160×160）
    │   │   ├── serving counter.png  出餐口（160×160）
    │   │   └── trashcan.png         垃圾桶（160×160）
    │   │
    │   ├── scripts/
    │   │   ├── core/
    │   │   │   ├── GridSystem.js    格子座標系統（純工具）
    │   │   │   ├── EventBus.js      全域事件匯流排（純工具）
    │   │   │   └── GameManager.js   遊戲狀態單例（cc.Component）
    │   │   ├── input/
    │   │   │   └── InputHandler.js  按鍵 → 抽象 Action（cc.Component）
    │   │   ├── player/
    │   │   │   ├── PlayerController.js    移動狀態機（cc.Component）
    │   │   │   └── AnimationController.js Sprite Sheet 動畫（cc.Component）
    │   │   └── station/
    │   │       └── StationBase.js   站台基礎類別（cc.Component）
    │   │
    │   ├── station_prefabs/         ← 各站台 prefab（拖入場景後設 gridCol/gridRow）
    │   │   ├── Stove_3_1.prefab
    │   │   ├── FoodBox_1_1.prefab
    │   │   ├── Serving_10_1.prefab
    │   │   └── Trash_10_6.prefab
    │   │
    │   ├── player_prefab/
    │   │   └── Player1.prefab       ← Player2 prefab 待補
    │   │
    │   └── final_project_trying.fire  ← 主場景
    └── ...（CC 自動產生的 library/temp/local 不需理會）
```

---

## 格子系統

| 參數 | 值 |
|---|---|
| Canvas | 960 × 640 px |
| 格子大小 | 80 × 80 px |
| 欄數 | 12 |
| 列數 | 8 |
| 原點（世界座標）| 左上角 (−480, 320) |

換算公式：
```
世界座標 x = −480 + col × 80 + 40
世界座標 y =  320 − row × 80 − 40
```

---

## 架構圖

```
┌─────────────────────────────────────────────────┐
│                  Cocos Creator Client            │
│                                                  │
│  InputHandler ──action──▶ PlayerController       │
│                               │                  │
│                    movementState/facing          │
│                               ▼                  │
│                    AnimationController           │
│                    (Sprite Sheet 切幀)            │
│                                                  │
│  PlayerController ──interact──▶ StationBase      │
│                                    │             │
│                              EventBus.emit()     │
│                                    ▼             │
│                             GameManager          │
│                          (score / timer)         │
│                                                  │
│  GameManager ──socket──▶ [NetworkManager 待實作] │
└─────────────────────────────────────────────────┘
```

### 各腳本職責

| 腳本 | 職責 | 依賴 |
|---|---|---|
| `GridSystem` | 格子 ↔ 世界座標轉換、通行狀態管理 | 無 |
| `EventBus` | 全域 pub/sub，讓各模組解耦溝通 | 無 |
| `GameManager` | 遊戲階段、分數、計時、站台與玩家索引表 | EventBus, GridSystem |
| `InputHandler` | 按鍵監聽，映射到抽象 Action（P1: WASD+F / P2: 方向鍵+Space） | 無 |
| `PlayerController` | 格子移動狀態機（IDLE/MOVING）、互動觸發 | GridSystem, EventBus, GameManager, InputHandler |
| `AnimationController` | 讀取 PlayerController 狀態，切換 Sprite Sheet 幀 | PlayerController |
| `StationBase` | 所有站台的基礎類別，處理放置/拾取邏輯 | GridSystem, EventBus, GameManager |

### 事件命名規範（EventBus）

```
player:moved     { playerId, col, row, facing }
player:pickup    { playerId, item }
player:drop      { playerId, item }
station:pickup   { stationType, col, row }
station:place    { stationType, col, row, item }
station:cook_done { stationType, col, row, result }
order:added      { recipe, timeLeft, reward }
order:completed  { recipe, score }
order:expired    { recipe }
game:start       { timeLeft }
game:tick        { timeLeft }
game:score       { score }
game:end         { score }
```

---

## Sprite Sheet 格式（角色）

```
red_guy.png / white_guy.png  →  320×320 px，4 欄 × 4 列

  row 0：往下走（預設朝向）
  row 1：往上走
  row 2：往左走
  row 3：往右走

每格 80×80 px，靜止時顯示該方向第 0 幀。
```

---

## 目前完成進度

### ✅ 完成
- [x] 格子系統（GridSystem）
- [x] 全域事件匯流排（EventBus）
- [x] 遊戲狀態管理（GameManager）
- [x] 雙人按鍵輸入（InputHandler）
- [x] 格子移動狀態機（PlayerController）
- [x] Sprite Sheet 動畫（AnimationController）
- [x] 站台基礎互動（StationBase）
- [x] 站台 Prefab（Stove / FoodBox / Serving / Trash）
- [x] 背景（程式生成，完全對齊 80px 格子）

### 🚧 待實作（客戶端）
- [ ] **站台子類別**：FoodBox（無限產生食材）、CuttingBoard（切割倒數）、Stove（烹飪倒數）、ServingCounter（對比訂單）、TrashCan（銷毀食材）
- [ ] **食材系統**：Item prefab、食材種類定義、ItemData
- [ ] **訂單系統**：OrderManager（隨機生成訂單、倒數、完成對比）
- [ ] **HUD UI**：分數顯示、計時器、訂單列表
- [ ] **場景切換**：Lobby 場景、Result 場景
- [ ] **多張地圖**：蘇記、漢城、水木、風雲地圖設計
- [ ] **Player2 Prefab**：補上 white_guy 的玩家 prefab
- [ ] **CuttingBoard Prefab**：補上缺漏的砧板 prefab

### 🚧 待實作（網路）
- [ ] **NetworkManager**（client）：WebSocket 連線、state 接收與套用
- [ ] **後端 Server**：Node.js + WebSocket、房間系統、game loop（50ms tick）、狀態廣播

---

## 五人分工建議

| 人 | 模組 | 目前可以開始的任務 |
|---|---|---|
| P1 後端 | `server/` Node.js | 建立 WebSocket server、房間系統、game tick |
| P2 核心玩法 | `station/`、`item/` | 實作 FoodBox、Stove、CuttingBoard 子類別；Item 系統 |
| P3 網路橋接 | `core/NetworkManager.js` | client 端 WebSocket 連線、EventBus 橋接 |
| P4 UI | `ui/` | HUD（分數/計時/訂單）、Lobby 場景、Result 場景 |
| P5 關卡內容 | `assets/` | 各地圖 prefab 擺設、訂單食譜設計、OrderManager |

---

## 按鍵對應

| 玩家 | 移動 | 互動 |
|---|---|---|
| Player 1 | WASD | F |
| Player 2 | 方向鍵 ↑↓←→ | Space |

---

## 下一步（最優先）

1. **補完 CuttingBoard & Player2 prefab**
2. **實作 Item prefab**（食材節點，可被拾取/放置的基礎物件）
3. **實作 FoodBox 子類別**（點擊後無限產生 Item）
4. **測試完整的「拿食材 → 放到砧板 → 放到爐子」流程**

完成以上後，網路同步層才有意義接入。
