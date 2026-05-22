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
        │   ├── photon.js                Photon JS SDK（Import As Plugin）
        │   ├── firebase-app-compat.js   Firebase App SDK（Import As Plugin）
        │   └── firebase-auth-compat.js  Firebase Auth SDK（Import As Plugin）
        │
        ├── scripts/
        │   ├── core/
        │   │   ├── GridSystem.js        格子座標系統（純工具模組）
        │   │   ├── EventBus.js          全域 pub/sub 事件匯流排（純工具模組）
        │   │   ├── GameManager.js       遊戲狀態單例（phase / score / timer）
        │   │   └── GameNetworkBridge.js 本地 EventBus ↔ Photon 網路橋接
        │   ├── input/
        │   │   └── InputHandler.js      按鍵 → 抽象 Action（P1 & P2 皆為 WASD+F）
        │   ├── network/
        │   │   └── NetworkManager.js    Photon 連線、房間管理、事件收發
        │   ├── player/
        │   │   ├── PlayerController.js    移動狀態機 + 互動觸發
        │   │   └── AnimationController.js Sprite Sheet 動畫（預快取 16 幀）
        │   ├── station/
        │   │   └── StationBase.js       所有站台的基礎類別
        │   └── ui/
        │       ├── MenuManager.js       Lobby UI（建立/加入房間、Google 登入、等待室名字顯示）
        │       └── LoginManager.js      Firebase Google 登入邏輯（備用，目前整合於 MenuManager）
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
| `MenuManager` | Lobby UI：Google 登入、等待室玩家名字顯示、Host 控制開始、建立/加入房間 | NetworkManager, Firebase Auth |
| `LoginManager` | Firebase Google 登入備用腳本（目前登入邏輯整合於 MenuManager） | Firebase Auth |

---

## 網路事件代碼（Photon raiseEvent code）

| code | 方向 | 內容 | 說明 |
|---|---|---|---|
| `1` | Guest → Host | `{ action: 'guest_joined', name }` | Guest 入房，帶名字通知 Host |
| `2` | Host → Guest | `{ action: 'host_start' }` | Host 按下開始，雙方進入遊戲 |
| `3` | Host → Guest | `{ action: 'host_info', name }` | Host 回傳自己名字給 Guest 顯示 |
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
| Player 2 | W A S D | F |

> 多人模式下兩台電腦各控制自己的角色，按鍵統一為 WASD + F。

---

## Bug 修復記錄

| # | 檔案 | 問題 | 修法 |
|---|---|---|---|
| 1 | `NetworkManager.js` | Host 收到 `start_game` 兩次，`cc.director.loadScene` 被呼叫兩次 | `_gameStarted` 改為 `onEvent` 與 `update()` 共用的統一旗標 |
| 2 | `NetworkManager.js` | `on()` 直接覆蓋 callback，多個監聽者互相覆蓋 | `_callbacks[type]` 改為陣列，新增 `off()` |
| 3 | `GameNetworkBridge.js` | 站台互動未同步、startGame 未呼叫、anonymous callback 洩漏 | 拆分 handler、延遲 startGame、存 callback 參考 |
| 4 | `AnimationController.js` | `_showFrame()` 每幀 `new cc.SpriteFrame()`，GC 壓力 | `start()` 預快取 16 個 SpriteFrame |
| 5 | `CookingStationBase.js` | `resultPrefix` 宣告卻從未使用（死碼） | 移除 `resultPrefix` 屬性，`_onCookDone` 直接 strip `noncooked_` |
| 6 | `CookingStationBase.js` | 烹飪中場景重載，`scheduleOnce` callback 在已銷毀元件上觸發 | `onDestroy` 呼叫 `unscheduleAllCallbacks()` |
| 7 | `ServingCounter.js` | `_onPlace` 未 emit `station:place`，出餐同步失效 | 補上 `station:place` + 新增 `station:serve` 事件供 Bridge 同步 |
| 8 | `GameNetworkBridge.js` | 遠端玩家 carryState 從未同步，place 互動在對端永遠失敗 | 拆分 pickup/place handler，加 `action` 欄位；place 時強制設 remote carryState |
| 9 | `GameNetworkBridge.js` | ServingCounter 出餐透過 EV_STATION 同步會雙重計分 | 改用 EV_SERVE(12) 同步出餐，`OrderManager.consumeOrder()` 只移除不計分 |
| 10 | `Trash.js` | `require('../core/EventBus')` 在方法內部（壞習慣） | 移到檔案頂部 |
| 11 | `HUD.js` | `_onOrderTick` 用字串分割更新倒數，食材名含雙空格時會壞 | `_orderNodes` 改存 `{ node, recipe }` struct，直接重組字串 |

---

## 目前完成進度

### ✅ 完成
- 格子系統（GridSystem）
- 全域事件匯流排（EventBus）
- 遊戲狀態管理（GameManager：LOBBY / PLAYING / RESULT、計時、計分）
- 雙人按鍵輸入（InputHandler，P1 & P2 統一 WASD+F）
- 格子移動狀態機（PlayerController）
- Sprite Sheet 動畫（AnimationController，含 SpriteFrame 預快取）
- 站台基礎互動（StationBase）
- 站台子類別：**FoodBox**（無限產生食材）、**Stove**（烹飪倒數 8s）、**CuttingBoard**（切割倒數 4s）、**ServingCounter**（訂單配對）、**Trash**（銷毀食材）
- **訂單系統**（OrderManager：隨機產生、倒數、完成比對）
- **HUD**（計時器 / 分數 / 訂單列表）
- **結果畫面**（ResultScreen：再玩一次 / 回主選單）
- **Google 帳號登入**（Firebase Auth，顯示暱稱）
- **等待室玩家名字顯示**（Host / Guest 雙方可見彼此暱稱）
- **Host 手動控制開始**（Guest 加入後由 Host 按下開始）
- 網路連線（NetworkManager：Photon Cloud）
- 網路同步（GameNetworkBridge：移動 EV10 / 站台 EV11 / 出餐 EV12）

### 🚧 待實作
- **Player2 Prefab**：white_guy 的玩家 prefab（目前只有 Player1）
- **CuttingBoard Prefab**：場景裡的砧板 prefab
- **食材圖片**：目前 FoodBox 產生的 item node 是空 Sprite，需換正式圖片
- **多張地圖**：蘇記、漢城、水木、風雲地圖場景
- **斷線處理**：遊戲中斷線時顯示提示並返回 Lobby
- **訂單同步**：兩端 OrderManager 各自獨立產生（random seed 不同），訂單列表可能不一致

---

## 已知設計限制

| 項目 | 說明 |
|---|---|
| 訂單列表不同步 | 兩端 OrderManager 各自 `Math.random()` 產生訂單，順序可能不同。出餐時 `consumeOrder(recipe)` 只找第一筆符合的，實際消掉的可能不是同一筆。目前可運作但 HUD 顯示可能有差異。 |
| EV_SERVE 的 order:completed id=-1 | 遠端出餐時 EventBus emit 的 id 為 -1，HUD 的 `_removeOrderCard(-1)` 找不到節點（因為 `consumeOrder` 已刪除，但 HUD 卡片的 id 是本地的）。目前 HUD 卡片需等到 `order:expired` 或本地下次 tick 才會消失。 |

---

## 本地雙端測試方式

1. 在 Cocos Creator 點右上角 **Preview → Browser**
2. 複製網址，開第二個瀏覽器分頁貼上
3. 一個分頁按「建立房間」，另一個輸入 4 位代碼按「加入房間」
4. 開 DevTools (F12) → Console，觀察 `cc.log` 確認事件流

### 驗證清單

| 測試項目 | 預期 Console 輸出 |
|---|---|
| Host 建房後 Guest 加入 | 兩端各只出現一次 `start_game` |
| P1 移動 | 對端出現 `onEvent code=10` |
| P1 拿食材 (FoodBox) | 對端出現 `onEvent code=11 action=pickup` |
| P1 放食材到 Stove | 對端出現 `onEvent code=11 action=place`，Stove 開始倒數 |
| P1 出餐成功 | 對端出現 `onEvent code=12`，分數增加 |
| 關閉 P2 分頁 | P1 端看到 `player_disconnected` |
