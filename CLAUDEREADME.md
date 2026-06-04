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

> ⚠️ 新工作流（本次起）：Claude 直接編輯 User 本機的 `final_Project_trying/` 目錄，User 測試確認後再 push。
> 不再需要 worktree → push → user pull 的流程。

---

## 格子系統

```
Canvas：1440 × 720 px（背景圖 2880×1440 ×0.5 均勻縮放，不失真）
格子：12 欄（col）× 8 列（row）

地板是透視梯形（下寬上窄），且垂直間距不均勻（上密下疏）。
用實測世界座標查找表儲存，精確對齊背景磁磚。

ROW_Y      = [187, 149, 102, 53, -5, -62, -130, -201, -273]  ← 9條水平邊界
ROW_LEFT_X = [-349,-356,-371,-384,-400,-416,-434,-455,-474]  ← 左緣（實測）
ROW_RIGHT_X= [ 378, 388, 401, 414, 430, 445, 463, 483, 502] ← 右緣（插值）

各列高度（上密下疏）：38/47/49/58/57/68/71/72 px
各列寬度（上窄下寬）：727→976 px（/12 = 60.6→81.3 per cell）

CELL_H ≈ 57.5（平均，各列實際不同）
CELL_W ≈ 71  （平均，各列實際不同）

toWorld(col, row) → 用 ROW_LEFT_X[row] 和 ROW_RIGHT_X[row] 算格子中心
toGrid(worldX, worldY) → 先用 ROW_Y 定 row，再用 cellW 定 col

四角世界座標：
  左上(-349, 187)  右上(378, 187)
  左下(-477,-273)  右下(502,-272)
```

- Station 在 Inspector 設 `gridCol` / `gridRow`，`StationBase.onLoad()` 自動對齊
- Station 寬度用 `GridSystem.getCellWidthAtRow(row)` 取得透視正確值
- PlayerController 速度 SPEED=150 px/s，碰撞盒 PLAYER_HALF_W=20, PLAYER_HALF_H=14
- 玩家 X 邊界用 `GridSystem.getFloorXBoundsAtWorldY(py)` 做透視插值
- 站台碰撞用 `GridSystem.getCellBounds(col, row)` 取精確 AABB
- item node 懸浮在玩家頭頂：`itemNode.y = GridSystem.CELL_H * 0.6` ≈ 34px

### 格子設計慣例（配合這張地圖）

| 區域 | col 範圍 | row 範圍 | 用途 |
|---|---|---|---|
| 上側工作台 | 0–11 | 0–1 | 站台放置區（靠近後牆）|
| 下側工作台 | 0–11 | 6–7 | 站台放置區（靠近前）|
| 左側工作台 | 0–1  | 0–7 | 站台放置區（靠左牆）|
| 右側工作台 | 10–11 | 0–7 | 站台放置區（靠右牆）|
| 可走通道   | 2–9  | 2–5 | 玩家行走區（中央 8×4）|

---

## 網路協定（Photon raiseEvent codes）

| code | 方向 | payload | 說明 |
|---|---|---|---|
| `1` | Guest→Host | `{ action:'guest_joined', name }` | Guest 入房告知名字 |
| `2` | Host→Guest | `{ action:'host_start', level }` | Host 按下開始（含關卡 ID） |
| `3` | Host→Guest | `{ action:'host_info', name }` | Host 回傳自己名字 |
| `10` | 雙向 | `{ x, y, facing, char }` | 玩家移動（世界座標） |
| `11` | 雙向 | `{ action, stationType, col, row, item }` | 站台互動（action='pickup'或'place'） |
| `12` | 雙向 | `{ col, row, item }` | 出餐成功（ServingCounter 專用，避免雙重計分） |
| `13` | 雙向 | `{ char }` | 角色選擇同步 |
| `14` | 雙向 | `{ skill, x, y, seed }` | 技能發動同步（含種子亂數，確保兩端走法一致）|
| `20` | Host→Guest | `{ timeLeft }` | 計時器同步 |
| `21` | 雙向 | `{ score }` | 分數同步 |
| `100` | 雙向 | `{ action:'player_ready', role }` | 雙方進場確認，才開始計時 |

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
7. **關卡選擇流程**：`LevelSelectManager.onLevelSelected()` 設 `window._selectedLevel` → `NetworkManager.startGame(levelId)` 廣播 EV code 2 含 level → 兩端收到後 load 'game' 場景（目前四個關卡都指向同一個 game.fire，未來可依 level 分叉）
8. **YSorter**：掛在 Stations / Players 的父節點上，每幀依子節點 Y 值設 zIndex，Y 越低（越靠畫面前方）→ zIndex 越大，製造 2.5D 前後遮擋感

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
- **自由移動**：velocity-based 連續行走（SPEED=150 px/s），對角線 ÷√2，AABB 分軸碰撞 + 沿牆滑動
- **透視格子系統**：ROW_Y/ROW_LEFT_X/ROW_RIGHT_X 查找表，精確對齊背景磁磚（上密下疏梯形）
- Canvas 1440×720，背景圖 2880×1440 ×0.5 均勻縮放
- 站台：FoodBox、Stove(8s)、CuttingBoard(4s)、ServingCounter、Trash
- 訂單系統（OrderManager：隨機產生、15s 間距、最多 3 筆、60s 倒數）
- HUD（計時器、分數、訂單列表）
- 結果畫面（ResultScreen）
- Google 登入 + 暱稱設定
- 等待室（Host/Guest 名字顯示）+ Host 手動開始
- 網路同步（移動 EV10 用 {x,y,facing,char}、站台 EV11、出餐 EV12）
- GridDebugger 開發工具（透視梯形格子視覺化）
- **3D 人物 Sprite**：Kenney Blocky Characters → Blender 等角渲染 → 8 方向靜態 Sprite Sheet（256×2048）
- **AnimationController**：8 方向切換 + 走路彈跳動畫 + 動態載入角色 sprite（`loadCharacter(charId)`）
- **PlayerController**：8 方向朝向偵測（對角優先）
- cc.Class getter 改為一般方法（避免 Cocos Creator 2.4.x 序列化報錯）
- **關卡選擇頁面**（朋友實作）：levelselect.fire + LevelSelectManager.js，4 張關卡卡片
- **NetworkManager 更新**：startGame 接收 level 參數，EV code 2 帶 level
- **YSorter**：掛在父節點，依 Y 值自動設 zIndex 產生 2.5D 前後遮擋
- **角色選擇場景**（charselect.fire）：全程式建 UI，CharSelectManager.js
  - 左側 4×2 頭像縮圖（Mask 裁切顯示臉部），右側完整大頭照
  - 技能選擇 2×2 卡片（佔位），確認後回 menu
  - 背景圖：`assets/resources/charselect_bg.png`（卡通廚房風格，Python PIL 生成）
- **角色網路同步**：EV_MOVE payload 夾帶 `char` 欄位（每幀），對方收到後呼叫 `loadCharacter`
  - Host/Guest 各自顯示自己選擇的角色
  - `AnimationController._loadedChar` 防重複載入
- **房間等待室**（朋友實作）：room.fire + RoomManager.js
  - 建立/加入房間改為跳轉 room.fire（MenuManager 不再自行管理房間 UI）
  - Host 點「確認開始」才廣播 start_game，防止場景衝突
- **排行榜系統**（朋友實作）：leaderboard.fire + LeaderboardManager.js
  - Firebase Firestore 儲存分數，只有 Host 上傳
  - 獨立場景 leaderboard.fire，可從主選單進入
- **結算場景重構**（朋友實作）：result.fire + ResultSceneManager.js
  - 獨立 result.fire，不再依賴 game.fire 內的 ResultScreen
- **player_ready 同步**（朋友實作）：EV code 100
  - 雙方進遊戲後各發送 player_ready，確認兩端都進場再開始計時，避免場景衝突
- **menu.fire 加回選角色按鈕**（BtnCharSelect → onCharSelect）
- **技能一：十八尖山野豬**（E 鍵）
  - `BoarController.js`：野豬 AI，速度 195 px/s（1.3x），隨機換向，10 秒消失
  - 碰到玩家 AABB 重疊時推開玩家（PUSH_IMPULSE=300）
  - Sprite：`resources/boar_sheet.png`（256×2048，8 方向，Blender 渲染）
  - Prefab：`player_prefab/Boar.prefab`（Sprite 子節點可獨立調整偏移對齊 hitbox）
  - 技能圖示：`resources/skill_boar_icon.png`，顯示在 CharSelectManager 技能卡
  - **網路同步**：EV_SKILL(14) 帶 `{ skill, x, y, seed }`
    - `seed` 為 LCG 種子亂數，兩端用相同 seed 確保走法完全一致，零額外封包
  - `GameManager.getAllPlayers()` 供 BoarController 查詢所有玩家
  - `PlayerController.boarPrefab`（@property）：game.fire 兩個玩家都已設定

### 🚧 尚缺
- 多張地圖（目前四個關卡都是同一個背景）
- 斷線處理（遊戲中）
- `window._selectedLevel` 在 GameManager 中尚未使用（關卡差異化待實作）
- 技能 2/3/4 後端邏輯（charselect 介面已完成，只有技能一實作）
- 排行榜 UI 節點綁定尚需在 Cocos Creator 編輯器完成

### Sprite Sheet 製作流程（備忘）
```
1. Kenney Blocky Characters → Models/GLB format/character-a.glb
2. Blender 3.6：匯入 GLB（File → Import → glTF 2.0），切到 Scripting 分頁
   執行 ~/Desktop/render_character.py
   → 輸出 ~/Desktop/render_output/ 8 張 PNG
     (down, down_right, right, up_right, up, up_left, left, down_left)
3. python3 ~/Desktop/make_spritesheet.py
   → 輸出 ~/Desktop/render_output/player1_sheet.png（256×2048，8 列）
4. 覆蓋 assets/img/player1_sheet.png，Cocos Assets 面板刷新即可

注意：相機 azimuth=45°，所以角色 z±45°/±135° 才是正臉對相機的 cardinal 方向，
      z=0°/90°/180°/-90° 是斜角方向。render_character.py 已依此命名正確。
```

### AnimationController DIR_TO_ROW（Sprite Sheet row 對應）
```
row 0 = down       row 1 = down_right
row 2 = right      row 3 = up_right
row 4 = up         row 5 = up_left
row 6 = left       row 7 = down_left
```

### 角色選擇系統
```
charselect.fire
  ↓ 確認選擇
window._selectedCharacter = 'character-x'   （持久在 window，場景切換不清除）
window._selectedSkill     = 'skill_N'

game.fire 載入時：
  AnimationController.start()
    → isLocal  → loadCharacter(window._selectedCharacter)
    → isRemote → loadCharacter(window._remoteCharacter) 或 _initFromSprite

EV_MOVE payload 帶 char 欄位：
  GameNetworkBridge._handleLocalMove → sendGameEvent(10, { x, y, facing, char })
  GameNetworkBridge._applyRemoteMove → anim.loadCharacter(data.char)
  AnimationController._loadedChar 防重複
```

可用角色清單（assets/resources/characters/）：
character-a ～ character-f、character-h、character-i（共 8 個，無 g）

背景圖生成腳本：`~/Desktop/make_charselect_bg.py`
```bash
python3 ~/Desktop/make_charselect_bg.py
cp ~/Desktop/charselect_bg.png .../assets/resources/charselect_bg.png
```

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
| 14 | 技能批 | Guest 按 E 無反應（game.fire Player2 boarPrefab=null）| `game.fire` |
| 15 | 技能批 | 技能只有本地看得到（未同步）| `GameNetworkBridge.js` / `PlayerController.js` |
| 16 | 技能批 | 兩端熊貓走法不同步 | `BoarController.js`（LCG 種子亂數）|

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
