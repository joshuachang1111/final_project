# 多人網路規格 (Network Spec)

## Photon Cloud 設定
- SDK：Photon JS SDK
- 連線物件：`window._nm`（NetworkManager 單例）
- 角色：`window._nmRole` = `'host'` | `'guest'` | undefined（單機）

---

## EventCode 對照表

| EV Code | 常數 | 方向 | 用途 |
|---------|------|------|------|
| 10 | EV_MOVE | H↔G | 玩家位置同步（20Hz） |
| 11 | EV_PICKUP | H↔G | 撿起物品 |
| 12 | EV_DROP | H↔G | 放下物品 |
| 13 | EV_ORDER | H→G | 訂單廣播（生成/過期/完成） |
| 14 | EV_SKILL | H↔G | 技能觸發 |
| 15 | EV_GUIDE | H→G | GuideOverlay 完成廣播 |
| 20 | EV_STATION | H↔G | 站台狀態同步 |
| 21 | EV_SERVE | H↔G | 出餐結果同步 |
| 22 | EV_TIMER | H→G | 遊戲計時同步（每秒） |

---

## GameNetworkBridge 事件流

### 開始遊戲流程
```
Host: _checkBothReady()
   → emit EventBus 'game:ready'
   → GuideOverlay 顯示

Host 長按 Space 3 秒:
   → GuideOverlay._hostComplete()
   → GameManager.startGame()
   → emit 'guide:local_complete'
   → GameNetworkBridge 廣播 EV_GUIDE(15)

Guest 收到 EV_GUIDE:
   → GuideOverlay._onRemoteComplete()
   → GameManager.startGame()

兩端 startGame():
   → GameManager._phase = 'playing'
   → emit 'game:start'
   → AudioManager 切換 BGM
   → OrderManager 開始生成訂單（Host 授權）
```

### EV_SKILL payload 格式
```js
// skill_1 清大熊貓
{ skill: 'skill_1', x: number, y: number, seed: number }

// skill_2 二退
{ skill: 'skill_2' }

// skill_3 草皮大尖叫
{ skill: 'skill_3' }

// skill_4 清交小徑
{ skill: 'skill_4', mode: 0|1, x: number, y: number }
```

### EV_ORDER payload
```js
{ action: 'add'|'expire'|'complete', order: { id, recipe, timeLimit, reward } }
```

---

## Host 授權項目
以下操作只有 Host 才執行，Guest 只接收結果：
- 訂單生成（OrderManager._spawnOrder）
- 訂單過期（OrderManager update）
- 技能 2「二退」（刷新訂單）

---

## 已知同步問題
- `const id = 1` 硬碼：多人模式下靠 `window._nmRole` 守門，不靠 id
- 遠端 P2 角色圖片依賴 `window._remoteCharacter`（需在 room 時廣播）
- LCG seed 確保熊貓走法一致，但若封包延遲過大可能輕微不同步

---

## 單機測試模式
- `window._nmRole` = undefined
- 兩個 PlayerController 同時跑，都讀 P1 (WASD) 的按鍵
- 技能相關操作有 `if (!window._nmRole && this.playerId !== 1) return` 守門
