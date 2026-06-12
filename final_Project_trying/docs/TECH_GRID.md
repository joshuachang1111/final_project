# GridSystem 技術規格 (Grid Tech Spec)

## 概覽
- Canvas：1440 × 720
- Grid：12 欄（COLS）× 8 列（ROWS）
- 透視梯形：上窄下寬，列高不均勻

---

## ROW_Y 查找表（9 條邊界線）
```
ROW_Y[0] = 187   (row 0 上緣)
ROW_Y[1] = 149
ROW_Y[2] = 102
ROW_Y[3] = 53
ROW_Y[4] = -5
ROW_Y[5] = -62
ROW_Y[6] = -130
ROW_Y[7] = -201
ROW_Y[8] = -273   (row 7 下緣)
```

## ROW_LEFT_X（各邊界左端）
```
ROW_LEFT_X = [-349, -356, -371, -384, -400, -416, -434, -455, -474]
```

## ROW_RIGHT_X（各邊界右端）
```
ROW_RIGHT_X = [378, 388, 401, 414, 430, 445, 463, 483, 502]
```

## 列高（透視效果）
```
row 0: 38px, row 1: 47px, row 2: 49px, row 3: 58px
row 4: 57px, row 5: 68px, row 6: 71px, row 7: 72px
總計: 460px
```

---

## 座標轉換

### toWorld(col, row) → { x, y }
格子座標 → 世界座標（格子中心點）
```js
const cellW = (ROW_RIGHT_X[r] - ROW_LEFT_X[r]) / COLS;
x = ROW_LEFT_X[r] + col * cellW + cellW / 2;
y = (ROW_Y[r] + ROW_Y[r+1]) / 2;
```

### toGrid(worldX, worldY) → { col, row }
世界座標 → 格子座標（向下取整）
- 先找 `ROW_Y` 範圍確定 row
- 再從 `ROW_LEFT_X` + cellW 算 col

### getFloorXBoundsAtWorldY(worldY) → { left, right }
給定 Y 座標，回傳該高度的水平邊界（透視插值）

### getCellBounds(col, row) → { left, right, top, bottom, cx, cy }
精確透視 AABB，供碰撞解算使用

---

## ConveyorBelt 的格子路徑插值
食材移動時以「邊界索引 t」追蹤位置（0 = 頂端，8 = 底端）：
```js
function _beltWorldPos(col, t) {
    r = Math.floor(t); frac = t - r;
    y = ROW_Y[r] + (ROW_Y[r+1] - ROW_Y[r]) * frac
    // X 也依欄寬插值（透視縮放）
}
```
速度換算：`tSpeed = itemSpeed / AVG_ROW_H`，其中 `AVG_ROW_H = 460/8 = 57.5`

---

## Blocked Cell 管理
```js
GridSystem.setBlocked(col, row, true)   // 標記不可通行
GridSystem.setBlocked(col, row, false)  // 移除標記
GridSystem.isWalkable(col, row)         // 查詢
GridSystem.getBlockedCells()            // 所有 blocked 格子（AABB 碰撞用）
```

站台 onLoad 標記 blocked，onDestroy 解除。

---

## floorBounds()
```js
{ left: -474, right: 502, top: 187, bottom: -273 }
```
PlayerController 用此限制玩家移動範圍。
