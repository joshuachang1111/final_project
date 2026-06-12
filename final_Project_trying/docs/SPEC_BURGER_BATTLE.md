# 漢堡組裝對抗模式規格 (Burger Battle Spec)

## 模式概述
雙人競技：各自獨立從輸送帶拿食材、組裝漢堡、送到送餐台計分。誰在 120 秒內得分最高獲勝。

---

## 場景佈局

```
col (0-indexed):
  0        1  2  3  4   5  6  7  8  9  10       11
  │                   │   │                      │
左輸送帶              P1  P2               右輸送帶
(col 0)             組裝  組裝            (col 11)
                    台欄  台欄
                  (rows  (rows
                  0-5)   0-5)

row 3 of col 4 = P1 送餐台
row 3 of col 5 = P2 送餐台

P1 初始位置: col=2, row=4
P2 初始位置: col=8, row=4
```

---

## 輸送帶 (ConveyorBelt)

| 屬性 | 值 |
|------|-----|
| 左帶 col | 0 |
| 右帶 col | 11 |
| 生成間隔 | 2.5 秒（兩帶錯開隨機偏移） |
| 食材速度 | 55 px/s（螢幕空間） |
| 移動方式 | 沿格子路徑（GridSystem.ROW_Y 透視插值） |
| 食材種類 | bread / meat / onion_sliced / tomato_sliced |
| 生成位置 | `_beltT = -0.5`（頂端以上） |
| 消亡位置 | `_beltT = 8.5`（底端以下） |

### 食材 Sprite UUID（cc.loader.load 用）
```js
bread:         '73ee62be-cfe6-4156-b49e-44efe57ba323'
meat:          'ce2e7135-87e2-48af-ab2a-3d0c3a7efd10'
onion_sliced:  '609d230d-9dce-4c64-bced-e6996e04f831'
tomato_sliced: '10d2e2c5-1dcb-4855-b273-206d32ca6dc2'
```

---

## 組裝台 (TABLE Station)

- **類型**：`StationBase`（stationType='TABLE'）
- **位置**：col 4 (P1) / col 5 (P2)，rows 0,1,2,4,5（row 3 是送餐台）
- **Sprite**：`table` UUID = `ee0596e6-9850-46c0-b431-fdd8b21f63b2`
- **邏輯**：與 game 模式相同，食材放上去會自動組合

### 漢堡組合順序（任意順序）
```
需要：bread + meat + onion_sliced（→ onion）+ tomato_sliced（→ tomato）
結果：hamburger（item.name = 'hamburger'）
```
注意：`onion_sliced` 在 StationBase.BURGER_PARTS 中對應 `['onion']`，可正確組合。

---

## 送餐台 (BurgerServingCounter)

- **類型**：`BurgerServingCounter`（extends cc.Component，非 StationBase）
- **位置**：col 4 row 3（P1）、col 5 row 3（P2）
- **Sprite**：`station_serving_counter` UUID = `bd98381c-39e6-475b-aca2-d2b4e9304d1b`
- **觸發**：`_tryInteract()` → `BurgerServingCounter.onInteract(player)`
- **條件**：player 持有 `hamburger` 才能送出

---

## F 鍵互動流程（burger_battle 模式）

```
空手:
  → _tryPickupFromBelt()（90px 近身感應帶子食材）
    成功 → pickUp(item)
    失敗 → _tryInteract()（面向格子站台）

持有食材:
  → _tryInteract() → StationBase TABLE.onInteract(player)
    → _tryAssembleOnTable()（組合食材）

持有漢堡（item.name='hamburger'):
  → _tryInteract() → BurgerServingCounter.onInteract(player)
    → dropItem() → destroy() → addScore(player.playerId, 150)
```

---

## 計分

| 事件 | 分數 |
|------|------|
| 完成漢堡並送出 | +150 分 |
| 時間到 | 比較 P1 vs P2 分數，顯示勝者橫幅 |

---

## 結算
- 勝負存於 `window._burgerBattleResult = { p1Score, p2Score, winner }`
- 2.5 秒後回 menu（Phase 3 改為跳到 result 場景）

---

## 程式化節點建立（BurgerBattleManager）

`_createStations()` 建立：
1. StationBase TABLE × 10（col 4/5, rows 0,1,2,4,5）
2. BurgerServingCounter × 2（col 4/5, row 3）

`_buildBasicUI()` 建立：
- 計時器（中上）
- P1 分數（左上）
- P2 分數（右上）
- 離開按鈕（右上）

---

## 多人同步（Phase 3，尚未實作）

計劃：
- EV_BELT（新增）：Host 廣播食材生成 seed 和位置，確保帶子同步
- EV_SCORE：廣播即時分數更新
- EV_ASSEMBLE：廣播組裝台狀態
- 帶子食材用確定性 seed 同步（類似 BoarController LCG 方案）
