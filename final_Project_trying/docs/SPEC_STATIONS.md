# 站台系統規格 (Stations Spec)

## StationBase 架構

所有站台繼承自 `StationBase`（或在 `StationBase._registry` 中手動注冊）。

### 靜態 Registry
```js
StationBase._registry  // Map<"col,row", StationBase>
```
- onLoad 時自動加入、onDestroy 時移除
- 讓無 GameManager 的場景（burger_battle）也能使用 `_tryInteract()`

### onLoad 行為
1. `GridSystem.toWorld(col, row)` 定位節點
2. `GridSystem.setBlocked(col, row, true)` 阻擋格子
3. `StationBase._registry.set(...)` 注冊
4. 若 `GameManager.instance` 存在：`registerStation(col, row, this)`

### onInteract(player)
```
player.isCarrying() → _onPlace(player)
else               → _onPickup(player)
```

---

## 站台類型

### TABLE（工作臺）
- 放食材 → 嘗試組合（`_tryAssembleOnTable`）
- 組合規則：`BURGER_PARTS` + `BURGER_RESULT_BY_KEY`
- 最終結果：`hamburger`（全部 4 種材料）
- Sprite UUID：`ee0596e6-9850-46c0-b431-fdd8b21f63b2`

### SERVING（出餐台，game 模式）
- 由 `ServingCounter.js` 覆寫 `_onPlace`
- 比對 `OrderManager.instance.completeOrder(item.name)`
- 成功：銷毀食材、emit `station:serve`
- 失敗：退回給玩家

### CUTTING_BOARD（切板）
- 玩家放上原始食材（onion/tomato）→ 自動計時切割
- 完成後變成 `onion_sliced` / `tomato_sliced`

### STOVE（爐具）
- 玩家放上 raw_meat → 計時烹飪
- 完成後變成 `meat`

### FOOD_BOX（食材箱）
- 玩家按 F → 生成一個食材（固定類型）
- 無限供應

### TRASH（垃圾桶）
- 玩家按 F → 銷毀持有食材

---

## 食材組合表（BURGER_RESULT_BY_KEY）
```
'bread,meat'              → 'bread_meat'
'bread,onion'             → 'bread_onion'
'bread,tomato'            → 'bread_tomato'
'bread,meat,onion'        → 'bread_meat_onion'
'bread,meat,tomato'       → 'bread_meat_tomato'
'bread,onion,tomato'      → 'bread_tomato_onion'
'bread,meat,onion,tomato' → 'hamburger'
```

注意：key 按 `['bread','meat','onion','tomato']` 固定順序排列（與放置順序無關）。

`onion_sliced` / `tomato_sliced` 透過 `BURGER_PARTS` 對應：
```js
BURGER_PARTS = {
    onion_sliced:  ['onion'],
    tomato_sliced: ['tomato'],
    ...
}
```

---

## BurgerServingCounter（burger_battle 專用）
- 不繼承 StationBase，但手動注冊到 `StationBase._registry`
- 阻擋格子（`GridSystem.setBlocked`）
- `onInteract(player)`：持有 'hamburger' → 銷毀 + 加 150 分
- Sprite UUID：`bd98381c-39e6-475b-aca2-d2b4e9304d1b`（station_serving_counter 512px）

---

## ItemSpriteRegistry（食材 Sprite 速查）

路徑：`assets/scripts/station/ItemSpriteRegistry.js`

食材 sprite 以 SpriteFrame UUID 直接載入（`cc.loader.load({uuid})`）。
完整 UUID 列表見 [ASSET_UUIDS.md](./ASSET_UUIDS.md)。
