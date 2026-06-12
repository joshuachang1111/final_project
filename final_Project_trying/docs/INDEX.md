# 文件索引 (Document Index)

> **使用方式**：根據你要解決的問題，讀對應的文件。不需要全部讀。

---

## 快速查找表

| 你想了解… | 讀這份 |
|----------|--------|
| 整個系統架構、模組關係 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 遊戲玩法設計 / 規則 / 關卡 | [SPEC_GAMEPLAY.md](./SPEC_GAMEPLAY.md) |
| 玩家移動、技能、互動邏輯 | [SPEC_PLAYER.md](./SPEC_PLAYER.md) |
| 多人連線、Photon、網路同步 | [SPEC_NETWORK.md](./SPEC_NETWORK.md) |
| 漢堡組裝對抗模式 | [SPEC_BURGER_BATTLE.md](./SPEC_BURGER_BATTLE.md) |
| 站台 (Station) 系統 | [SPEC_STATIONS.md](./SPEC_STATIONS.md) |
| UI / 場景流程 / 音樂 | [SPEC_UI_FLOW.md](./SPEC_UI_FLOW.md) |
| 格子座標系、透視地板 | [TECH_GRID.md](./TECH_GRID.md) |
| Asset UUID 速查 | [ASSET_UUIDS.md](./ASSET_UUIDS.md) |
| 已知問題 / 待辦 / Future Scope | [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) |

---

## 文件簡述

### ARCHITECTURE.md
所有 JS 模組的依賴關係圖、各模組職責一句話說明、場景（.fire）結構。

### SPEC_GAMEPLAY.md
關卡列表、訂單系統（Order/Recipe）、得分規則、遊戲狀態機（waiting→playing→end）。

### SPEC_PLAYER.md
PlayerController 完整規格：移動參數、四個技能（skill_1~4）、持物 API、網路同步格式。  
AnimationController 角色 sprite sheet 格式。

### SPEC_NETWORK.md
Photon Cloud 設定、EventCode 對照表（EV_MOVE=10 … EV_GUIDE=15）、GameNetworkBridge 事件流。

### SPEC_BURGER_BATTLE.md
漢堡對抗模式完整規格：場景佈局、輸送帶、組裝台、送餐台、計分、多人同步規劃。

### SPEC_STATIONS.md
StationBase 架構、各站台類型（TABLE/STOVE/CUTTING_BOARD/SERVING/TRASH/FOOD_BOX）、食譜系統（BURGER_RESULT_BY_KEY）。

### SPEC_UI_FLOW.md
場景切換流程、GuideOverlay 機制、CharSelectManager、AudioManager BGM 規則。

### TECH_GRID.md
GridSystem ROW_Y 查找表、座標轉換公式、透視梯形計算。

### ASSET_UUIDS.md
食材 / 角色 / 站台圖片的 SpriteFrame UUID 速查表。

### KNOWN_ISSUES.md
已知 bug、技術債、未來功能（Future Scope）。
