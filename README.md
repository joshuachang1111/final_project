# 清大版 Overcooked — Final Project (Group 14)

> 以清華大學各學餐為場景的兩人合作料理遊戲。
> 玩家扮演學餐打工學生，透過 Photon 連線，在時限內完成料理訂單。

**組員：** 113062101 黃冠鈞、113062105 張彥坤、113062106 劉宇軒、113020028 廖煌洲、113033158 章童

---

## 專案結構

```
final_project_trying/
├── README.md
└── final_Project_trying/            ← Cocos Creator 2.4.x 專案根目錄
    ├── project.json
    └── assets/
        ├── img/                     ← 所有圖片素材
        │   ├── background.png       960×640，程式生成，對齊 80px 格子
        │   ├── red_guy.png          玩家1 sprite sheet（320×320，4×4 幀）
        │   ├── white_guy.png        玩家2 sprite sheet（320×320，4×4 幀）
        │   ├── stove.png            火爐（160×160）
        │   ├── cutting board.png    砧板（160×160）
        │   ├── food_box.png         食材箱（160×160）
        │   ├── serving counter.png  出餐口（160×160）
        │   └── trashcan.png         垃圾桶（160×160）
        │
        ├── libs/
        │   └── photon.js            Photon JS SDK（Import As Plugin）
        │
        ├── scripts/
        │   ├── core/
        │   │   ├── GridSystem.js        格子座標系統（純工具模組）
        │   │   ├── EventBus.js          全域 pub/sub 事件匯流排（純工具模組）
        │   │   ├── GameManager.js       遊戲狀態單例（phase / score / timer）
        │   │   └── GameNetworkBridge.js 本地 EventBus ↔ Photon 網路橋接
        │   ├── input/
        │   │   └── InputHandler.js      按鍵 → 抽象 Action（P1: WASD+F / P2: 方向鍵+Space）
        │   ├── network/
        │   │   └── NetworkManager.js    Photon 連線、房間管理、事件收發
        │   ├── player/
        │   │   ├── PlayerController.js    移動狀態機 + 互動觸發
        │   │   └── AnimationController.js Sprite Sheet 動畫（預快取 16 幀）
        │   ├── station/
        │   │   └── StationBase.js       所有站台的基礎類別
        │   └── ui/
        │       └── MenuManager.js       Lobby UI（建立 / 加入房間）
        │
        ├── station_prefabs/
        │   ├── Stove_3_1.prefab
        │   ├── FoodBox_1_1.prefab
        │   ├── Serving_10_1.prefab
        │   └── Trash_10_6.prefab
        ├── player_prefab/
        │   └── Player1.prefab           （Player2 prefab 待補）
        └── *.fire                       ← 場景檔（menu.fire / game.fire）
```

---

## 架構圖

```
┌──────────────────────────────────────────────────────────────────┐
│                      Cocos Creator Client                        │
│                                                                  │
│  ┌─────────────┐   action    ┌──────────────────┐               │
│  │ InputHandler│────────────▶│ PlayerController │               │
│  └─────────────┘             │  (state machine) │               │
│                              └────────┬─────────┘               │
│                                       │ state (facing/moving)    │
│                                       ▼                          │
│                              ┌──────────────────┐               │
│                              │AnimationController│               │
│                              │ (SpriteSheet 切幀)│               │
│                              └──────────────────┘               │
│                                                                  │
│  PlayerController ──interact──▶ StationBase                     │
│                                      │                           │
│                               EventBus.emit()                    │
│                      ┌───────────────┴───────────────┐          │
│                      ▼                               ▼           │
│               GameManager                  GameNetworkBridge     │
│           (phase/score/timer)                    │    │          │
│                                          EV_MOVE │    │EV_STATION│
│                                                  ▼    ▼          │
│                                         NetworkManager           │
│                                        (Photon SDK 封裝)         │
└──────────────────────────────────────────────────────────────────┘
                                │  Photon WebSocket (WSS)
                                ▼
                     ┌──────────────────────┐
                     │  Photon Cloud (asia) │
                     │  App: 3bb784be-...   │
                     └──────────────────────┘
```

### 各腳本職責

| 腳本 | 職責 | 依賴 |
|---|---|---|
| `GridSystem` | 格子 ↔ 世界座標轉換、通行狀態管理 | 無 |
| `EventBus` | 全域 pub/sub，讓各模組解耦溝通 | 無 |
| `GameManager` | 遊戲階段(LOBBY/PLAYING/RESULT)、分數、計時、站台與玩家索引表 | EventBus, GridSystem |
| `InputHandler` | 按鍵監聽，映射到抽象 Action | 無 |
| `PlayerController` | 格子移動狀態機（IDLE/MOVING）、互動觸發、網路同步接收端 | GridSystem, EventBus, GameManager, InputHandler |
| `AnimationController` | 讀取 PlayerController 狀態，查表切換 Sprite Sheet 幀（預快取） | PlayerController |
| `StationBase` | 所有站台的基礎類別，處理放置/拾取邏輯 | GridSystem, EventBus, GameManager |
| `NetworkManager` | Photon LoadBalancing Client 封裝、房間建立/加入、事件收發；支援多個監聽者 | Photon SDK |
| `GameNetworkBridge` | 將 EventBus 的本地事件（移動/站台互動）透過 NetworkManager 廣播，並將遠端事件重放回本地 | EventBus, GameManager, NetworkManager |
| `MenuManager` | Lobby UI：顯示房間代碼、處理建立/加入按鈕；綁定 NetworkManager 回調 | NetworkManager |

---

## 網路事件代碼（Photon raiseEvent code）

| code | 方向 | 內容 | 說明 |
|---|---|---|---|
| `1` | Guest → Host | `{ action: 'guest_joined' }` | Guest 入房後通知 Host 開始遊戲 |
| `10` | 雙向 | `{ col, row, facing }` | 玩家移動同步 |
| `11` | 雙向 | `{ playerId, stationType, col, row, item }` | 站台互動同步（拾取 / 放置） |

---

## EventBus 事件命名規範

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

## 格子系統

| 參數 | 值 |
|---|---|
| Canvas | 960 × 640 px |
| 格子大小 | 80 × 80 px |
| 欄數（col） | 12 |
| 列數（row） | 8 |
| 原點（世界座標）| 左上角 (−480, 320) |

```
世界座標 x = −480 + col × 80 + 40
世界座標 y =  320 − row × 80 − 40
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
AnimationController 於 start() 預先快取全部 16 個 SpriteFrame。
```

---

## 按鍵對應

| 玩家 | 移動 | 互動 |
|---|---|---|
| Player 1 | W A S D | F |
| Player 2 | ↑ ↓ ← → | Space |

---

## Bug 修復記錄

| # | 檔案 | 問題 | 修法 |
|---|---|---|---|
| 1 | `NetworkManager.js` | Host 收到 `start_game` 兩次，`cc.director.loadScene` 被呼叫兩次 | `_gameStarted` 改為 `onEvent` 與 `update()` 共用的統一旗標 |
| 2 | `NetworkManager.js` | `on()` 直接覆蓋 callback，多個監聽者互相覆蓋 | `_callbacks[type]` 改為陣列，新增 `off()` |
| 3 | `GameNetworkBridge.js` | 站台互動（拾取/放置）完全未透過網路同步 | 監聽 `station:pickup` / `station:place`，以 event code 11 廣播並在對端重放 |
| 4 | `GameNetworkBridge.js` | `GameManager.startGame()` 從未被呼叫，計時器永不啟動 | `onLoad()` 延遲一幀後呼叫 `startGame()` |
| 5 | `GameNetworkBridge.js` | `window._nm.on('game_event', ...)` 傳入匿名函式，無法在 `onDestroy` 移除，場景重載後累積 | callback 存為 `this._onGameEvent`，`onDestroy` 呼叫 `nm.off()` |
| 6 | `AnimationController.js` | `_showFrame()` 每幀 `new cc.SpriteFrame()`，產生大量 GC 壓力 | `start()` 預先建立全部 16 個 SpriteFrame 並快取為 `this._frames[row][col]` |

---

## 目前完成進度

### ✅ 完成
- 格子系統（GridSystem）
- 全域事件匯流排（EventBus）
- 遊戲狀態管理（GameManager：LOBBY / PLAYING / RESULT、計時、計分）
- 雙人按鍵輸入（InputHandler，P1: WASD+F / P2: 方向鍵+Space）
- 格子移動狀態機（PlayerController）
- Sprite Sheet 動畫（AnimationController，含 SpriteFrame 預快取）
- 站台基礎互動（StationBase：放置 / 拾取）
- 站台 Prefab（Stove / FoodBox / Serving / Trash）
- Lobby UI（MenuManager：建立房間 / 加入房間）
- 網路連線（NetworkManager：Photon Cloud，房間代碼系統）
- 網路同步（GameNetworkBridge：移動 + 站台互動雙向同步）
- 背景（程式生成，完全對齊 80px 格子）

### 🚧 待實作
- **站台子類別**：FoodBox（無限產生食材）、CuttingBoard（切割倒數）、Stove（烹飪倒數）、ServingCounter（對比訂單）、TrashCan（銷毀食材）
- **食材系統**：Item prefab、食材種類定義（ItemData）
- **訂單系統**：OrderManager（隨機生成訂單、倒數、完成對比）
- **HUD UI**：分數顯示、計時器、訂單列表
- **結果場景**：Result 場景（顯示最終分數）
- **多張地圖**：蘇記、漢城、水木、風雲地圖
- **Player2 Prefab**：white_guy 的玩家 prefab
- **CuttingBoard Prefab**：補上缺漏的砧板 prefab
- **斷線處理**：遊戲中斷線時顯示提示並返回 Lobby

---

## 五人分工建議

| 人 | 模組 | 任務 |
|---|---|---|
| P1 | `station/` 子類別 | FoodBox、Stove（烹飪倒數）、CuttingBoard（切割倒數） |
| P2 | `item/`、Item prefab | ItemData 定義、食材種類、可拾取 Item 節點 |
| P3 | `ui/`、OrderManager | HUD（分數/計時/訂單欄）、OrderManager（訂單生成與比對） |
| P4 | 關卡內容 | 各地圖 prefab 擺設、訂單食譜設計 |
| P5 | 整合測試、斷線處理 | 雙端同步驗證、遊戲中斷線返回 Lobby |

---

## 本地雙端測試方式

1. 在 Cocos Creator 點右上角 **Preview → Browser**
2. 複製網址，開第二個瀏覽器分頁貼上
3. 一個分頁按「建立房間」，另一個輸入 4 位代碼按「加入房間」
4. 開 DevTools (F12) → Console，觀察 `cc.log` 確認事件流

### 驗證清單

| 測試項目 | 預期 |
|---|---|
| Host 建房後 Guest 加入 | `start_game` 在兩端各只觸發一次 |
| P1 移動後，P2 畫面上的 P1 有動 | `onEvent code=10` 有收到 |
| P1 對 Station 互動，P2 端 Station 狀態改變 | `onEvent code=11` 有收到 |
| 關閉 P2 分頁 | P1 端看到 `player_disconnected`，回到主選單 |
