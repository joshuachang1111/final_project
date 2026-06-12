# 遊戲玩法規格 (Gameplay Spec)

## 核心概念
清大版 Overcooked：多人合作烹飪遊戲，2 名玩家同一畫面或 Photon 連線，在時限內完成訂單。

---

## 遊戲狀態機

```
waiting ──(GuideOverlay 完成)──▶ playing ──(時間到)──▶ end
```

- `waiting`：GuideOverlay 覆蓋螢幕，輸入鎖定
- `playing`：倒數計時、可移動互動
- `end`：emit `game:end`，1 秒後切換到 result 場景

---

## 關卡列表

| levelId | 場景名 | 說明 |
|---------|--------|------|
| `susui` | `game` | 水水（預設關卡） |
| `hansung` | `game` | 漢聲 |
| `shuimu` | `game` | 水木 |
| `fengyun` | `game` | 風雲 |
| `burger_battle` | `burger_battle` | 漢堡組裝對抗（雙人競技） |

---

## 訂單系統（game 模式）

### 食譜 (Recipes)
```js
{ recipe: 'burger',          timeLimit: 60,  reward: 100 }
{ recipe: 'chocolate_toast', timeLimit: 50,  reward: 80  }
{ recipe: 'black_tea',       timeLimit: 40,  reward: 70  }
{ recipe: 'burger_tea',      timeLimit: 70,  reward: 150 }
{ recipe: 'toast_tea',       timeLimit: 60,  reward: 120 }
{ recipe: 'burger_toast',    timeLimit: 70,  reward: 160 }
{ recipe: 'full_meal',       timeLimit: 90,  reward: 250 }
```

### 規則
- Host 授權生成訂單（Guest 只接收）
- 最多同時 3 筆訂單
- 訂單過期 → 扣分（負分）
- 完成訂單 → 加 reward 分
- OrderManager 使用 `elapsed`（wall-clock）計時，避免 dt 累積誤差

### 漢堡食材組合表
```
bread + meat                     → bread_meat
bread + meat + onion             → bread_meat_onion
bread + meat + tomato            → bread_meat_tomato
bread + meat + onion + tomato    → hamburger
bread + onion                    → bread_onion
bread + tomato                   → bread_tomato
bread + onion + tomato           → bread_tomato_onion
```

注意：`onion_sliced` / `tomato_sliced` 在 StationBase 中對應到 `onion` / `tomato` 組件。

---

## 得分規則（game 模式）
- 完成訂單：+reward（依食譜）
- 訂單超時：-reward/2（懲罰）
- 技能「二退」(skill_2)：移除最舊訂單，無分數影響

---

## 技能系統（E 鍵）

| 技能 ID | 名稱 | 冷卻 | 效果 |
|---------|------|------|------|
| skill_1 | 清大熊貓 | 無 | 在玩家前方生成一隻熊貓（150px/s，推開玩家，10s 消失） |
| skill_2 | 二退 | 20s | 移除最舊訂單（Host 授權執行） |
| skill_3 | 草皮大尖叫 | 30s | 全場玩家方向顛倒 5 秒 + 速度 1.5x |
| skill_4 | 清交小徑 | 20s | 隨機傳送（50% 自己傳到隊友；50% 隊友傳到自己） |

技能在 CharSelectManager 選擇，存於 `window._selectedSkill`。

---

## 遊戲計時
- 預設時限：見 GameManager.totalTime（Inspector 設定）
- 倒數顯示：`MM:SS`
- 最後 30 秒：切換 BGM 為 `bgm_urgent`

---

## 結算畫面
- 從 `window._gameScore` 讀取最終分數
- 顯示分數 + 兩個按鈕（再玩一次 / 回主選單）
