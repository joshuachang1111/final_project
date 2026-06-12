# Asset UUID 速查表 (Asset UUIDs)

> 所有 UUID 均為 SpriteFrame sub-asset UUID（可直接用 `cc.loader.load({uuid})` 載入）。

---

## 食材（resources/food/）

| 食材名 | SpriteFrame UUID |
|--------|-----------------|
| bread | `73ee62be-cfe6-4156-b49e-44efe57ba323` |
| meat | `ce2e7135-87e2-48af-ab2a-3d0c3a7efd10` |
| onion_sliced | `609d230d-9dce-4c64-bced-e6996e04f831` |
| tomato_sliced | `10d2e2c5-1dcb-4855-b273-206d32ca6dc2` |
| hamburger | `914753a6-2e0f-4050-a3be-620e95c46b6b` |
| onion | (與 onion_sliced 不同圖，需另查 .meta) |
| tomato | (與 tomato_sliced 不同圖，需另查 .meta) |
| raw_meat | (需另查 .meta) |

---

## 組合食材（resources/food/）

| 食材名 | SpriteFrame UUID |
|--------|-----------------|
| bread_meat | `df2a5d64-0d14-432d-8888-c3b59d3457f2` |
| bread_meat_onion | `1864793b-baa0-41fa-8b30-df56b0836cdb` |
| bread_meat_tomato | `e9f0b01e-1f33-4abc-95e0-95de5a11ea46` |
| bread_onion | `b2385982-ce69-431a-9729-671005196644` |
| bread_tomato | `81d01fc4-0798-47e1-89a5-2a35cfa6cff1` |
| bread_tomato_onion | `c8ed2d9c-b898-4836-83c3-70fda00a43fd` |

（來源：ItemSpriteRegistry.js）

---

## 站台（img/）

| 站台 | SpriteFrame UUID | 來源路徑 |
|------|-----------------|---------|
| table（工作臺） | `ee0596e6-9850-46c0-b431-fdd8b21f63b2` | `img/level1/工作臺/table.png` |
| serving counter（小圖示） | `6f2627d3-c18d-460c-80f4-650e79beac11` | `img/serving counter.png` (160px) |
| station_serving_counter（512px） | `bd98381c-39e6-475b-aca2-d2b4e9304d1b` | `img/station_serving_counter.png` |
| station_serving_counter（1254px） | `85cb1bb9-75a6-4ba1-9684-014d33706372` | `img/level1/工作臺/station_serving_counter.png` |

---

## 角色（resources/characters/）

格式：`{charId}_sheet.png`（256×2048 sprite sheet）  
`cc.resources.load('characters/{charId}_sheet', cc.Texture2D, callback)` 載入。

| charId | 備註 |
|--------|------|
| character-a | 可用 |
| character-b | 可用 |
| character-c | 可用 |
| character-d | 可用 |
| character-e | 可用 |
| character-f | 可用 |
| character-h | 可用（跳過 g） |
| character-i | 可用 |

---

## 熊貓（Panda）

- **Sprite Sheet**：`resources/characters/panda_sheet.png`（256×2048，8 方向）
- 格式同角色 sprite sheet

---

## 載入方式對照

| 情境 | 建議方式 |
|------|---------|
| 食材（belt 生成） | `cc.loader.load({uuid: FOOD_SPRITE_UUIDS[name]}, cb)` |
| 食材（站台組合後） | `ItemSpriteRegistry.applySpriteFrame(node, itemName)` |
| 角色 sprite sheet | `cc.resources.load('characters/...', cc.Texture2D, cb)` |
| 站台視覺 | `cc.loader.load({uuid: TABLE_SPRITE_UUID}, cb)` |
