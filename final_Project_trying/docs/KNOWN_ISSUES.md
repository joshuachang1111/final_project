# 已知問題 / 待辦 / Future Scope

---

## 🔴 Active Issues（需解決的 Bug）

### [ISSUE-001] burger_battle 多人同步尚未實作
- **狀態**：Phase 3 未開始
- **影響**：兩台機器各自看到不同的食材位置和分數
- **計劃**：EV_BELT（food seed 同步）+ EV_SCORE + EV_ASSEMBLE

### [ISSUE-002] 單機模式 P2 PlayerController 用 P1 鍵盤
- **狀態**：已知設計限制（`const id = 1` hardcode）
- **影響**：單機測試時兩個玩家同時移動、共享鍵盤
- **計劃**：burger_battle 需要多人模式正確測試

### [ISSUE-003] burger_battle 結算畫面暫回 menu
- **狀態**：Phase 3 待辦
- **影響**：時間到後直接回主選單，沒有正式結算頁面
- **計劃**：複用 result scene，讀 `window._burgerBattleResult`

---

## 🟡 Technical Debt（技術債）

### [TD-001] PlayerController 輸入 id 硬碼
- `const id = 1` 在 update() 裡，所有 Controller 都讀 P1 的按鍵
- 多人靠 `_nmRole` 守門，但代碼不直觀

### [TD-002] BurgerStation.js 已廢棄但留在 codebase
- Phase 2 改為使用 StationBase TABLE，BurgerStation.js 不再使用
- 建議：刪除或保留作為文件參考

### [TD-003] window globals 管理分散
- `_selectedCharacter`, `_selectedSkill`, `_nmRole`, `_nm`, `_gameScore` 等全都在 window
- 沒有集中管理，跨場景狀態難以追蹤

### [TD-004] GuideOverlay UUID 鎖定
- UUID `c635b5a6-293a-4e23-859a-684e46499131` 是 local UUID
- 若 merge 後 remote UUID 覆蓋會導致 "Can not find cc.Component" 錯誤
- **注意**：每次 merge 後要確認 GuideOverlay.js.meta 的 UUID 是否被改變

### [TD-005] 食材圖片位置（trimX/Y）未補正
- 食材 PNG 都是 1024×1024，trimmed 後偏移量存在 .meta 的 subMeta
- `cc.loader.load({uuid})` 載入時會自動套用 trim，但需確認顯示效果

---

## 🟢 Future Scope（未來功能）

### [FS-001] burger_battle 多人同步（Phase 3）
- 輸送帶 seed 同步（類似 BoarController LCG）
- 組裝台狀態廣播
- 分數即時同步
- 結算畫面整合

### [FS-002] burger_battle 結算場景
- 複用 result scene
- 讀 `window._burgerBattleResult.winner/p1Score/p2Score`
- 上方顯示「P1 獲勝！」等，下方保留原有兩個按鈕

### [FS-003] burger_battle 食材丟棄機制
- 目前：在組裝欄外按 F 可丟棄（自動 destroy）
- 考慮：加入掉落動畫或垃圾桶

### [FS-004] 排行榜系統
- `leaderboard` 場景已存在於 LevelSelectManager.LEVEL_SCENE_MAP 候補
- 需後端或 localStorage 實作

### [FS-005] 更多關卡
- 目前 4 個 game 關卡（susui/hansung/shuimu/fengyun）均使用相同 game.fire
- 可新增不同站台佈局的 .fire 場景

### [FS-006] 技能視覺效果強化
- 技能 3「草皮大尖叫」無視覺提示，只有方向反轉
- 考慮：全螢幕閃爍或螢幕邊框效果

### [FS-007] burger_battle 輸送帶視覺強化
- 目前：cc.Graphics 灰色梯形 + 橘色箭頭
- 考慮：加入動態紋理或移動的格子線表示輸送帶在動

---

## 🔵 Merge 注意事項

每次 git merge 後必查：
1. `GuideOverlay.js.meta` UUID 是否仍為 `c635b5a6-293a-4e23-859a-684e46499131`
2. `game.fire` 的 Player1/Player2 節點是否有 AnimationController (29104WsNU9DP6zxuvEb0taM)
3. `burger_battle.fire` 的兩個 Player 節點是否有 AnimationController (index 24, 25)
