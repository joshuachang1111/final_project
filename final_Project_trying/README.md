# 114-02 軟體專題 - Final Project

一個使用 Cocos Creator 2.x 開發的多人協作烹飪遊戲。

## 🎮 遊戲特性

### 已完成功能
- ✅ **8方向人物移動** - WASD 移動，角色朝向動畫跟隨
- ✅ **透視梯形格子系統** - 2.5D 視角的網格碰撞檢測
- ✅ **多人模式** - 透過 Photon 實現房間配對
- ✅ **關卡選擇系統** - 多個關卡場景支持
- ✅ **工作站互動** - 食材箱、砧板、爐灶等交互元素
- ✅ **分數系統** - 實時計分和遊戲計時
- ✅ **排行榜系統**（開發中）- Firebase Firestore 支持

### 開發中功能
- 🔄 **排行榜頁面** - 需要在 Cocos Creator 中完成 UI 綁定
  - 遊戲結果自動上傳到 Firebase
  - 支持按分數排名
  - 多人模式中只有 Host 上傳分數

## 🛠️ 技術棧

- **引擎**: Cocos Creator 2.x
- **網絡**: Photon PUN 2
- **認證**: Firebase Authentication (Google OAuth)
- **數據庫**: Firebase Firestore
- **版本控制**: Git

## 📁 項目結構

```
final_Project_trying/
├── assets/
│   ├── img/              # 遊戲資源圖片
│   ├── scripts/
│   │   ├── core/         # 核心系統 (GameManager, GridSystem, etc.)
│   │   ├── ui/           # UI 管理器 (MenuManager, ResultSceneManager)
│   │   ├── player/       # 玩家控制和動畫
│   │   ├── station/      # 工作站交互邏輯
│   │   ├── input/        # 輸入管理
│   │   ├── network/      # 網絡同步
│   │   └── source/       # 原始素材（音樂、UI、字體等）
│   ├── libs/             # 第三方庫 (Firebase SDK, Photon)
│   ├── game.fire         # 遊戲主場景
│   ├── menu.fire         # 菜單場景
│   ├── levelselect.fire  # 關卡選擇場景
│   ├── result.fire       # 遊戲結果場景（新增）
│   └── ...
├── settings/
│   └── project.json      # 項目配置
└── README.md             # 本文檔
```

## 🚀 快速開始

### 環境需求
- Cocos Creator 2.4.x 或更高版本
- Node.js（用於構建）
- Firebase 項目

### 本地執行

1. **打開項目**
   ```bash
   # 在 Cocos Creator 中打開此文件夾
   ```

2. **配置遊戲時間**（可選）
   - 編輯 `GameManager.js` 的 `totalTime` 屬性
   - 預設值: 180 秒（3分鐘）

3. **運行遊戲**
   - Cocos Creator 中點擊「Play」

## 📋 當前待做項目

### 排行榜功能完成
- [ ] 在 Cocos Creator 中完成 `result.fire` 場景 UI 綁定
  - [ ] 綁定 `scoreLabel` (cc.Label)
  - [ ] 綁定 `replayBtn` (cc.Button)
  - [ ] 綁定 `menuBtn` (cc.Button)
  - [ ] 綁定 `leaderboardBtn` (cc.Button)
  - [ ] 綁定 `leaderboardPanel` (cc.Node)
  - [ ] 綁定 `leaderboardContent` (cc.Node)
- [ ] 移除 `game.fire` 中的舊 ResultScreen 組件
- [ ] 測試完整的遊戲流程 (遊戲 → 結果頁面 → 排行榜)
- [ ] 測試多人模式分數上傳

### 遊戲功能擴展
- [ ] 新增音樂和音效系統
- [ ] 實現訂單系統和目標管理
- [ ] 新增更多關卡和難度等級
- [ ] 實現玩家統計和成就系統

## 🔧 Firebase 設定

### Firestore Database

**Collection**: `leaderboard`

**Document 格式**:
```json
{
  "name": "玩家名稱",
  "uid": "firebase-user-id",
  "score": 1500,
  "level": "level-name",
  "timestamp": "2026-06-03T12:34:56Z"
}
```

**Security Rules**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 🎮 遊戲流程

1. **主菜單** (menu.fire)
   - Google 登入
   - 創建房間或加入房間
   - 查看排行榜

2. **關卡選擇** (levelselect.fire)
   - 房主選擇要遊玩的關卡

3. **遊戲場景** (game.fire)
   - 遊玩時間: 10 秒（可配置）
   - 多人實時同步

4. **結果場景** (result.fire) - **開發中**
   - 顯示最終分數
   - 上傳分數到排行榜（Host only）
   - 查看排行榜
   - 重玩或回到主菜單

## 💡 關鍵實現

### LeaderboardManager
- 負責 Firebase Firestore 的初始化和數據操作
- `submitScore()` - 上傳分數到排行榜
- `fetchTopScores(limit)` - 查詢前 N 名排行榜

### ResultSceneManager
- 管理 result 場景的生命週期
- 處理分數上傳和排行榜查詢
- 支持多人模式（只有 Host 上傳）

### GameManager
- 管理遊戲流程和計時
- 維護玩家和工作站註冊表
- 遊戲結束時自動加載 result 場景

## 📝 最近更新

### 2026-06-03
- 實現完整的排行榜系統（Firebase Firestore 整合）
- 修復 Cocos Creator 2.x async/await 兼容性問題
- 新增 result.fire 場景用於展示遊戲結果
- 新增詳細的 debug logging

### 2026-06-02
- 實現 10 秒遊戲計時
- 完成多人遊戲結果同步
- 新增結果頁面 UI 框架

## 🐛 已知問題

- [ ] result.fire 場景需要完成 UI 綁定到 ResultSceneManager
- [ ] 遊戲結束時需要從 game.fire 中移除舊的 ResultScreen 組件

## 📞 聯繫方式

- 開發者: 劉育軒
- 郵件: liu113062106@gapp.nthu.edu.tw
- 項目: https://github.com/joshuachang1111/final_project

---

**上次更新**: 2026-06-03
**版本**: 0.2.0 (Alpha - 排行榜開發中)
