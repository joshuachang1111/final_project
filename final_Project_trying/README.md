# 114-02 軟體專題 - Final Project
清大版 Overcooked：多人合作/競技烹飪遊戲，Cocos Creator 2.4.x + Photon Cloud。

---

## 🎮 功能清單

### 主遊戲模式（合作）
- ✅ 8 方向人物移動（WASD）+ 角色 Sprite Sheet 動畫
- ✅ 透視梯形格子系統（12×8 Grid，2.5D 視角）
- ✅ Photon Cloud 雙人連線（Host/Guest 角色）
- ✅ 訂單系統（7 種食譜，計時 + 得分）
- ✅ 工作站互動（食材箱、砧板、爐灶、出餐台、垃圾桶）
- ✅ 4 個技能系統（E 鍵，角色選擇時決定）
- ✅ GuideOverlay 說明（Host 長按 Space 3 秒開始）
- ✅ 結算畫面（Firebase 排行榜上傳）

### 漢堡組裝對抗模式（競技）
- ✅ 雙人競技，各自輸送帶 → 組裝台 → 送餐台
- ✅ 輸送帶沿透視格子路徑移動，食材使用遊戲原版圖片
- ✅ 組裝邏輯複用 StationBase（bread+meat+onion+tomato → hamburger）
- ✅ 每個漢堡 +150 分，120 秒倒數
- ✅ 時間到跳結算畫面，顯示勝者 + 雙方分數
- 🔄 多人同步（Phase 3，尚未實作）

### 角色與技能
- 角色：character-a ~ character-i（8 種）
- 技能：清大熊貓（skill_1）/ 二退（skill_2）/ 草皮大尖叫（skill_3）/ 清交小徑（skill_4）

---

## 🕹️ 遊戲流程

```
menu → room → charselect → levelselect → game / burger_battle → result
```

---

## 🛠️ 技術棧

| 項目 | 技術 |
|------|------|
| 引擎 | Cocos Creator 2.4.x（JavaScript） |
| 多人 | Photon Cloud SDK |
| 資料庫 | Firebase Firestore（排行榜） |
| 認證 | Firebase Authentication（Google OAuth） |
| 版本控制 | Git |

---

## 📁 專案結構

```
final_Project_trying/
├── assets/
│   ├── scripts/
│   │   ├── core/      GameManager, GridSystem, EventBus, InputHandler,
│   │   │              AudioManager, ConveyorBelt
│   │   ├── player/    PlayerController, AnimationController, BoarController
│   │   ├── station/   StationBase, ServingCounter, BurgerServingCounter,
│   │   │              OrderManager, ItemSpriteRegistry, ...
│   │   ├── ui/        CharSelectManager, LevelSelectManager, GuideOverlay,
│   │   │              BurgerBattleManager, ResultSceneManager, ...
│   │   └── input/     InputHandler
│   ├── img/           遊戲圖片資源（站台、角色、UI）
│   ├── resources/     動態載入資源（food, characters, audio）
│   ├── game.fire      主遊戲場景
│   ├── burger_battle.fire  漢堡對抗場景
│   ├── result.fire    結算場景
│   └── ...
├── docs/              完整技術文件（見 docs/INDEX.md）
└── README.md
```

---

## 📖 開發文件

詳細規格見 `docs/` 目錄：
- `docs/INDEX.md` — 文件索引（按問題找對應文件）
- `docs/SPEC_BURGER_BATTLE.md` — 漢堡對抗模式
- `docs/ARCHITECTURE.md` — 系統架構
- `docs/ASSET_UUIDS.md` — 圖片 UUID 速查

---

## ⚡ 按鍵

| 按鍵 | 功能 |
|------|------|
| W/A/S/D | 移動 |
| F | 互動（拾取、放置、出餐） |
| E | 技能 |
| Space（長按） | GuideOverlay 確認開始 |

---

## 🔴 已知限制

- 漢堡對抗模式目前為本地單人測試（多人同步 Phase 3 待實作）
- `const id = 1` hardcode：單機測試時兩個玩家共用 P1 按鍵
