# CLAUDEREADME — 給 Claude 的專案記憶檔

> 這個檔案是給 Claude 讀的，紀錄重要的架構決策、已知限制、bug 歷史，
> 讓每次新的對話不需要重新讀所有程式碼才能繼續工作。
> **每次有重大改動時請更新此檔案。**

---

## 專案基本資訊

- **名稱**：清大版 Overcooked（NTHU Overcooked）
- **引擎**：Cocos Creator 2.4.x（JavaScript，非 TypeScript）
- **網路**：Photon Cloud（LoadBalancing SDK，region: asia）
- **登入**：Firebase Auth（Google OAuth）
- **App ID**：`3bb784be-d7cb-49de-b737-c2f7b0a430f0`
- **Firebase Project**：`overcook-37ac5`
- **Repo**：`joshuachang1111/final_project`（GitHub）

---

## 重要路徑

| 說明 | 路徑 |
|---|---|
| Cocos Creator 實際專案（User 開的）| `/Users/tungchang/Desktop/大二作業/軟體設計實驗/final_project_trying/final_Project_trying/` |
| Claude worktree（編輯用）| `/Users/tungchang/Desktop/大二作業/軟體設計實驗/final_project_trying/.claude/worktrees/strange-cartwright-b32b4c/` |
| **Push 方式** | 在 worktree 做 commit，再 `git push origin claude/strange-cartwright-b32b4c:main` |
| **User pull 方式** | `cd /Users/tungchang/Desktop/大二作業/軟體設計實驗/final_project_trying && git pull origin main` |

> ⚠️ worktree 和 User 的 Cocos Creator 是不同目錄。編輯後一定要 push + user pull 才能在編輯器看到。

---

## 格子系統

```
Canvas：960 × 640 px
格子：12 欄（col）× 8 列（row），每格 80 × 80 px
原點（世界座標左上角）：(-480, 320)

toWorld(col, row):
  x = -480 + col * 80 + 40
  y =  320 - row * 80 - 40

範例：
  (0,0)   → (-440,  280)  左上角
  (11,7)  → ( 440, -280)  右下角
  (6,3)   → (  40,  -40)  接近中心
```

- Station 在 Inspector 設 `gridCol` / `gridRow`，`StationBase.onLoad()` 自動對齊並標記為 blocked
- `GridSystem.setBlocked` 在 `StationBase.onLoad` 設 true，`onDestroy` 設 false

---

## 網路協定（Photon raiseEvent codes）

| code | 方向 | payload | 說明 |
|---|---|---|---|
| `1` | Guest→Host | `{ action:'guest_joined', name }` | Guest 入房告知名字 |
| `2` | Host→Guest | `{ action:'host_start' }` | Host 按下開始 |
| `3` | Host→Guest | `{ action:'host_info', name }` | Host 回傳自己名字 |
| `10` | 雙向 | `{ col, row, facing }` | 玩家移動 |
| `11` | 雙向 | `{ action, stationType, col, row, item }` | 站台互動（action='pickup'或'place'） |
| `12` | 雙向 | `{ col, row, item }` | 出餐成功（ServingCounter 專用，避免雙重計分） |

---

## 食材命名規則

```
FoodBox 產生：'noncooked_burger'、'noncooked_salad'、'noncooked_soup'
Stove / CuttingBoard 處理後：'burger'、'salad'、'soup'（去掉 noncooked_ 前綴）
OrderManager RECIPES 配對：'burger'、'salad'、'soup'
```

---

## 架構總覽

```
InputHandler → PlayerController → AnimationController
                    ↓ onInteract
                StationBase（及子類別）
                    ↓ EventBus.emit
       ┌────────────┴─────────────┐
  GameManager              GameNetworkBridge
 (phase/score/timer)      (EventBus ↔ Photon)
       ↑                         ↓
  OrderManager             NetworkManager
 (訂單生成/配對)            (Photon SDK)
       ↓
      HUD / ResultScreen
```

### 關鍵設計決策

1. **EventBus 解耦**：所有模組只透過 EventBus 溝通，不直接互相 require（除了 GameManager 作為服務）
2. **GameNetworkBridge 是唯一網路邊界**：其他腳本完全不知道 Photon 存在
3. **ServingCounter 用 EV_SERVE(12) 同步**：不走 EV_STATION(11)，避免兩端都呼叫 `completeOrder()` 造成雙重計分
4. **遠端 place 動作**：Bridge 直接設 `remote._carryState = HOLDING`，再呼叫 `station.onInteract(remote)`，讓 station 的 `_onPlace` 正常執行（包含烹飪計時）
5. **startGame 時機**：`GameNetworkBridge.onLoad()` 延遲一幀（`scheduleOnce(..., 0)`）呼叫 `GameManager.startGame()`，確保所有 onLoad 跑完
6. **GameManager 是 persistRootNode**：場景切換後存活，重新開始時 `startGame()` 會重置狀態

---

## 已知設計限制（暫不修改）

### 1. 訂單列表兩端不同步
兩端的 `OrderManager` 各自獨立執行 `Math.random()`，產生的訂單順序和種類可能不同。  
`EV_SERVE` 送過去的 `item`（recipe）在對端用 `consumeOrder(recipe)` 消除「第一筆符合的訂單」，不保證消掉的是「同一筆」。

**影響**：分數同步（正確）、訂單卡片顯示可能有差異。  
**正確修法**：Host 產生訂單後廣播給 Guest，Guest 完全跟隨 Host 的訂單列表（需較大重構）。

### 2. EV_SERVE 的 HUD 卡片更新問題
`_applyRemoteServe` 發出的 `order:completed` 帶 `id: -1`，HUD 的 `_removeOrderCard(-1)` 找不到節點，該筆訂單的倒數卡片不會立即消失，要等 `order:expired` 才消。

**影響**：視覺上對端的 HUD 訂單卡可能比實際多顯示幾秒。  
**正確修法**：在 EV_SERVE payload 中攜帶對端可辨識的訂單 id，或改用「Host 廣播訂單」架構。

---

## 目前進度（截至最新 commit）

### ✅ 完成
- 格子移動、動畫、碰撞
- 站台：FoodBox、Stove(8s)、CuttingBoard(4s)、ServingCounter、Trash
- 訂單系統（OrderManager：隨機產生、15s 間距、最多 3 筆、60s 倒數）
- HUD（計時器、分數、訂單列表）
- 結果畫面（ResultScreen）
- Google 登入 + 暱稱設定
- 等待室（Host/Guest 名字顯示）+ Host 手動開始
- 網路同步（移動 EV10、站台 EV11、出餐 EV12）

### 🚧 尚缺
- Player2 prefab（white_guy）
- CuttingBoard prefab
- 食材 Sprite 圖片（目前是空 Sprite 佔位）
- 多張地圖
- 斷線處理（遊戲中）

---

## Bug 修復歷史（所有已修）

| # | 修復日期 | 問題 | 所在檔案 |
|---|---|---|---|
| 1 | 第1批 | Host `start_game` 雙重觸發 | `NetworkManager.js` |
| 2 | 第1批 | `on()` 覆蓋 callback | `NetworkManager.js` |
| 3 | 第1批 | 站台互動完全未同步 | `GameNetworkBridge.js` |
| 4 | 第1批 | `startGame()` 從未呼叫 | `GameNetworkBridge.js` |
| 5 | 第1批 | anonymous callback 無法移除 | `GameNetworkBridge.js` |
| 6 | 第1批 | 每幀 new SpriteFrame GC | `AnimationController.js` |
| 7 | 第2批 | `resultPrefix` 死碼 | `CookingStationBase.js` |
| 8 | 第2批 | 烹飪中重載 crash | `CookingStationBase.js` |
| 9 | 第2批 | ServingCounter 未 emit 事件 | `ServingCounter.js` |
| 10 | 第2批 | 遠端 carryState 不同步導致 place 失敗 | `GameNetworkBridge.js` |
| 11 | 第2批 | ServingCounter 同步雙重計分 | `GameNetworkBridge.js` / `ServingCounter.js` |
| 12 | 第2批 | Trash.js inline require | `Trash.js` |
| 13 | 第2批 | HUD 訂單 tick 字串分割脆弱 | `HUD.js` |

---

## 測試指令（DevTools Console）

```js
// 確認 Photon 狀態
const c = window._photonClient;
Photon.LoadBalancing.LoadBalancingClient.StateToName(c.state);
// → "Joined"

// 確認角色
window._nmRole;   // "host" or "guest"

// 確認訂單
OrderManager.instance.getOrders();

// 確認分數
GameManager.instance.score;
```
