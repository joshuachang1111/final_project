# 玩家系統規格 (Player Spec)

## 移動參數
```
SPEED         = 150 px/s
PLAYER_HALF_W = 20 px   (碰撞半寬)
PLAYER_HALF_H = 14 px   (碰撞半高)
INV_SQRT2     = 0.707   (對角線速度修正)
NET_SEND_INTERVAL = 0.05s (20 Hz 同步)
```

---

## 按鍵配置（InputHandler）
```
Player 1：W/A/S/D 移動 + F 互動 + E 技能
Player 2：W/A/S/D 移動 + F 互動 + E 技能
（多人模式下同一鍵盤用一樣的按鍵，靠 _nmRole 區分）
```

---

## PlayerController 生命週期

### onLoad()
- 從 `startCol/startRow` 計算初始世界座標
- 若有 `GameManager.instance`：呼叫 `registerPlayer`
- 訂閱 `skill:remote`、`skill:chaos_start` EventBus 事件

### update(dt)
1. 多人守門：只有本地玩家讀鍵盤
2. Phase 鎖定：`GameManager._phase !== 'playing'` 時鎖定（burger_battle 無此鎖）
3. 讀 InputHandler 狀態 → 計算 vx/vy
4. `_moveWithCollision(dt)` → 更新 node 位置
5. 更新技能/chaos 冷卻計時
6. F 鍵互動：burger_battle 用近身帶子拾取 + `_tryInteract()`；game 用 `_tryInteract()`
7. E 鍵技能：`_useSkill()`
8. 20Hz emit `player:moved`

---

## 碰撞系統
- 分軸 AABB：先解 X，再解 Y（沿牆滑動）
- `GridSystem.getBlockedCells()` 取所有被佔格子
- `GridSystem.getFloorXBoundsAtWorldY()` 取透視邊界

---

## 持物 API
```js
pickUp(itemNode)    // 拿起 → 設為 node 子節點，顯示於玩家頭頂
dropItem()          // 放下 → 回傳 itemNode，parent 設為 null
isCarrying()        // 是否持有物品
heldItem()          // 取得當前持物節點
```

---

## 技能詳細規格

### skill_1 清大熊貓
- **触发**：E 鍵（無冷卻）
- **生成**：在玩家 facing 方向前 50px 生成 BoarController 節點
- **同步**：EV_SKILL payload `{ skill:'skill_1', x, y, seed }`
- **seed**：LCG 確保雙端走法一致（`s = (1664525*s + 1013904223) >>> 0`）
- **速度**：195 px/s（玩家 1.3x）
- **圖片**：`resources/characters/panda_sheet.png`（256×2048，8 方向）
- **生命**：10 秒後自動銷毀
- **碰撞**：與玩家 AABB 重疊 → 推開玩家

### skill_2 二退
- **冷卻**：20s
- **Host 授權**：只有 Host 的 OrderManager 實際執行，Guest emit `order:refresh` 但 Guest 端 OrderManager 忽略
- **廣播**：EV_SKILL payload `{ skill:'skill_2' }`

### skill_3 草皮大尖叫
- **冷卻**：30s
- **效果**：emit `skill:chaos_start` → 所有 PlayerController `_chaosTimer = 5`
- **廣播**：EV_SKILL payload `{ skill:'skill_3' }`
- **期間**：方向顛倒（vx=-vx, vy=-vy）+ 速度 1.5x

### skill_4 清交小徑
- **冷卻**：20s
- **mode 0**：自己傳到隊友旁邊（+30px）
- **mode 1**：隊友傳到自己旁邊
- **廣播**：EV_SKILL payload `{ skill:'skill_4', mode, x, y }`
- **Guard**：單機模式只讓 playerId=1 觸發

---

## AnimationController Sprite Sheet 格式
```
檔案：resources/characters/{charId}_sheet.png
尺寸：256 × 2048 px（1 欄 × 8 列，每格 256×256）
row 0 = down
row 1 = down_right
row 2 = right
row 3 = up_right
row 4 = up
row 5 = up_left
row 6 = left
row 7 = down_left
```

彈跳動畫：BOUNCE_SCALE=1.1，BOUNCE_HALF=0.12s（0.24s 一完整週期）

---

## 多人注意事項
- `const id = 1` 硬編碼在 update() 裡：單機模式兩個 Controller 都讀 P1 的按鍵
- 多人模式靠 `window._nmRole` 守門（host → P1，guest → P2）
- 遠端玩家位置用 `applyNetworkState()` + cc.tween 補間（0.08s）
