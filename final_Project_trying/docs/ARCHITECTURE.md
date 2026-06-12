# 系統架構 (Architecture)

## 技術棧
- **引擎**：Cocos Creator 2.4.x（JavaScript）
- **Canvas**：1440 × 720
- **Grid**：12 欄 × 8 列，2.5D 透視梯形
- **多人**：Photon Cloud SDK

---

## 模組依賴圖

```
┌─────────────────────────────────────────────┐
│                  UI Layer                    │
│  CharSelectManager  LevelSelectManager       │
│  GuideOverlay  BurgerBattleManager          │
│  AudioManager (persistRootNode)             │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│               Core Layer                    │
│  GameManager (persistRootNode, singleton)   │
│  GameNetworkBridge (Photon 橋接)            │
│  EventBus (解耦用, 全域 emit/on)            │
│  InputHandler (persistRootNode, 按鍵狀態)   │
└──────┬───────────┬───────────┬──────────────┘
       │           │           │
┌──────▼──┐  ┌────▼────┐  ┌───▼──────────────┐
│ Player  │  │Station  │  │   Grid            │
│ Layer   │  │ Layer   │  │   GridSystem      │
│         │  │         │  │   (座標轉換)      │
│ Player  │  │StationB.│  └───────────────────┘
│ Control │  │Stove    │
│ Animat. │  │Cutting  │
│ Boar    │  │Serving  │
│ Control │  │FoodBox  │
└─────────┘  │Trash    │
             │OrderMgr │
             └─────────┘
```

---

## 各模組職責

### Core
| 模組 | 職責 |
|------|------|
| `GameManager` | 遊戲狀態機 (phase: waiting→playing→end)、玩家/站台 registry、計時 |
| `GameNetworkBridge` | Photon EventCode 收送、遠端玩家移動/技能同步、Guide 同步 |
| `EventBus` | 全域 pub/sub 解耦（`emit`/`on`/`off`） |
| `InputHandler` | 按鍵 mapping (WASD/方向鍵/F/E)、held/justPressed 狀態 |
| `GridSystem` | 世界座標 ↔ 格子座標、blocked cell 管理 |
| `AudioManager` | BGM 管理（menu/game/urgent/result）|
| `ConveyorBelt` | burger_battle 輸送帶：食材生成 + 格子路徑移動 |

### Player
| 模組 | 職責 |
|------|------|
| `PlayerController` | 移動碰撞、F 互動、E 技能、持物 API、網路同步 emit |
| `AnimationController` | 8 方向 Sprite Sheet 切換 + 走路彈跳動畫 |
| `BoarController` | 技能 1「清大熊貓」的野豬/熊貓 AI（LCG seed 同步） |

### Station
| 模組 | 職責 |
|------|------|
| `StationBase` | 基底：格子定位/阻擋、持物、TABLE 食材組裝邏輯、靜態 `_registry` |
| `ServingCounter` | 出餐：比對 OrderManager 訂單、成功銷毀食材加分 |
| `BurgerServingCounter` | burger_battle 出餐：漢堡 → +150 分（不依賴 OrderManager） |
| `OrderManager` | 訂單生命週期（生成/計時/過期）、host 授權 |
| `CuttingBoard` | 食材切割（計時 + 進度條） |
| `Stove` | 食材烹飪（計時 + 進度條） |
| `FoodBox` | 無限食材源（按 F 取出） |
| `Trash` | 丟棄食材 |

### UI
| 模組 | 職責 |
|------|------|
| `CharSelectManager` | 角色 + 技能選擇，存 `window._selectedCharacter/Skill` |
| `LevelSelectManager` | 關卡選擇，Host 廣播後 Guest 跟著切換 |
| `GuideOverlay` | 遊戲開始前說明圖，Host 長按 Space 3 秒開始 |
| `BurgerBattleManager` | 漢堡對抗模式控制器（計時、HUD、站台建立） |
| `AudioManager` | 場景 BGM 管理（persistRootNode） |

---

## 場景清單

| 場景 | 用途 | 關鍵節點 |
|------|------|---------|
| `menu` | 主選單 | Canvas > Menu |
| `room` | 多人房間（Photon 連線） | Managers（GameNetworkBridge） |
| `charselect` | 角色/技能選擇 | Canvas > CharSelectManager |
| `levelselect` | 關卡選擇 | Canvas > LevelSelectManager |
| `game` | 主遊戲場景 | Canvas > Stations, Players, Managers |
| `burger_battle` | 漢堡對抗模式 | Canvas > BeltLeft, BeltRight, Players, Managers |
| `result` | 結算畫面 | Canvas > ResultManager |

---

## persistRootNode 列表
場景切換後仍存活的節點（`cc.game.addPersistRootNode`）：
- `InputHandler` 所在節點
- `GameManager` 所在節點（menu→game 流程）
- `AudioManager` 所在節點

---

## 事件流（正常遊戲一局）
```
[menu] → NetworkManager 初始化
[room] → Photon 連線 → host/guest 角色確定
[charselect] → window._selectedCharacter / _selectedSkill 設定
[levelselect] → nm.startGame(levelId) → 雙端切換場景
[game] → GameNetworkBridge._checkBothReady()
       → emit 'game:ready'
       → GuideOverlay 顯示
       → Host 長按 Space → emit 'guide:local_complete'
       → GameNetworkBridge 廣播 EV_GUIDE
       → 雙端 GameManager.startGame() → phase='playing'
       → 遊戲進行…
       → GameManager._endGame() → emit 'game:end' → loadScene('result')
```
