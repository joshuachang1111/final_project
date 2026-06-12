const EventBus    = require('./EventBus');
const GameManager = require('./GameManager');
const ItemSprites = require('../station/ItemSpriteRegistry');

// ── Photon event codes ────────────────────────────────────
const EV_MOVE       = 10;   // 玩家移動
const EV_STATION    = 11;   // 站台互動（pickup / place）
const EV_SERVE      = 12;   // 出餐成功（用於同步分數與訂單移除，避免雙重計分）
const EV_CHAR       = 13;   // 角色選擇同步（遊戲開始時各自廣播）
const EV_SKILL      = 14;   // 技能發動同步（x, y, skill）
const EV_GUIDE      = 15;   // Host 長按空白完成，通知 Guest 開始遊戲
const EV_TICK_SYNC  = 20;   // 計時器同步（Host 廣播，保持兩人計時同步）
const EV_SCORE_SYNC = 21;   // 分數同步（任一方分數改變時廣播）

// ── Burger Battle 專用事件 ──────────────────────────────────
const EV_BB_SEED    = 30;   // Host → Guest: 帶子 seed（遊戲開始時廣播）
const EV_BB_PICKUP  = 31;   // 任一方: 撿走帶子食材 {col, idx, playerId}
const EV_BB_SCORE   = 32;   // 任一方: 分數更新 {playerId, score}
const EV_BB_END     = 33;   // Host → Guest: 遊戲結束 {p1Score, p2Score, winner}
const EV_BB_SERVE   = 34;   // 任一方: 出餐成功 {playerId} → 對方 drop remote player 持有食材

cc.Class({
    extends: cc.Component,

    onLoad() {
        const role = window._nmRole || 'host';
        this._localId  = role === 'host' ? 1 : 2;
        this._remoteId = role === 'host' ? 2 : 1;
        this._role = role;
        cc.log('GameNetworkBridge: role =', role, ', localId =', this._localId);

        // Bug 5 fix (from previous): store all callbacks so onDestroy can remove them
        this._onLocalMove    = this._handleLocalMove.bind(this);
        this._onLocalPickup  = this._handleLocalPickup.bind(this);
        this._onLocalPlace   = this._handleLocalPlace.bind(this);
        this._onLocalServe   = this._handleLocalServe.bind(this);
        this._onLocalScore   = this._handleLocalScore.bind(this);
        this._onLocalSkill   = this._handleLocalSkill.bind(this);
        this._onGuideComplete = this._handleGuideComplete.bind(this);
        this._onGameStart    = this._handleGameStart.bind(this);
        this._onGameEvent    = (msg) => this._applyGameEvent.call(this, msg);

        EventBus.on('player:moved',        this._onLocalMove,    this);
        EventBus.on('station:pickup',      this._onLocalPickup,  this);
        EventBus.on('station:place',       this._onLocalPlace,   this);
        EventBus.on('station:serve',       this._onLocalServe,   this);
        EventBus.on('game:score',          this._onLocalScore,   this);
        EventBus.on('skill:local',         this._onLocalSkill,   this);
        EventBus.on('guide:local_complete', this._onGuideComplete, this);
        EventBus.on('game:start',          this._onGameStart,    this);

        // ── Burger Battle 本地事件 → 廣播給對方 ─────────────
        EventBus.on('bb:local_pickup', (d) => this._handleBBPickup(d),  this);
        EventBus.on('bb:local_score',  (d) => this._handleBBScore(d),   this);
        EventBus.on('bb:local_seed',   (d) => this._handleBBSeed(d),    this);
        EventBus.on('bb:local_serve',  (d) => this._handleBBServe(d),   this);

        if (window._nm) {
            window._nm.on('game_event', this._onGameEvent);
        }

        // 等待兩人都進場
        this._localReady = false;
        this._remoteReady = false;
        this._gameStarted = false;

        // 延遲 0.5 秒，確保雙方都進遊戲並設好事件監聽，再發送「我已進場」信號
        this.scheduleOnce(() => {
            cc.log('[GameNetworkBridge] 本地進場完成，發送 ready 信號');
            this._localReady = true;
            if (window._nm) {
                window._nm.sendGameEvent(100, { action: 'player_ready', role: this._role });
            }
            // 馬上檢查是否兩人都準備好
            this._checkBothReady();

            // 3 秒後如果還沒開始，自動開始遊戲（防止單人遊戲或網路超時）
            this.scheduleOnce(() => {
                if (!this._gameStarted) {
                    cc.log('[GameNetworkBridge] 3秒超時，自動開始遊戲');
                    this._remoteReady = true; // 假設對方準備好
                    this._checkBothReady();
                }
            }, 3);
        }, 0.5);

    },

    _onRemotePlayerReady(msg) {
        cc.log('[GameNetworkBridge] 收到對方進場信號，role=', msg.role);
        this._remoteReady = true;
        cc.log('[GameNetworkBridge] 狀態：_localReady=', this._localReady, '_remoteReady=', this._remoteReady);
        this._checkBothReady();

        // 對方 GNB 已確認上線（它能發 player_ready，代表 onLoad 裡的 _nm.on 已完成）。
        // 通知 BurgerBattleManager 現在可以安全廣播 EV_BB_SEED，不會因 Guest 尚未訂閱而丟包。
        EventBus.emit('bb:partner_ready', { role: msg.role });
    },

    _checkBothReady() {
        cc.log('[GameNetworkBridge] _checkBothReady called: _localReady=', this._localReady, '_remoteReady=', this._remoteReady, '_gameStarted=', this._gameStarted);

        if (this._gameStarted) {
            cc.log('[GameNetworkBridge] 遊戲已開始，忽略重複的 ready');
            return;
        }

        if (this._localReady && this._remoteReady) {
            this._gameStarted = true;
            cc.log('[GameNetworkBridge] ✓ 兩人都已進場，顯示關卡說明');
            // 通知 GuideOverlay 顯示（不直接呼叫 startGame，等 Host 長按空白鍵）
            EventBus.emit('game:ready');
            // 不在這裡 fallback 開局 — GuideOverlay 已經在 scene 裡，會主導 startGame。
            // 之前曾經加 1s fallback（處理 GuideOverlay 沒進 scene 的情況），但 GuideOverlay
            // 顯示 overlay 不會改 GameManager.phase，fallback 條件永遠成立 → 訂單在玩家
            // 還沒看完 guide 時就被 spawn。GuideOverlay 入場後這條 fallback 已沒必要。
        } else {
            cc.log('[GameNetworkBridge] 還在等待對方... _localReady=', this._localReady, '_remoteReady=', this._remoteReady);
        }
    },

    _setupTimerSync() {
        // Host 每 0.5 秒廣播一次計時器，保持兩人同步
        if (this._role === 'host') {
            this._timerSyncSchedule = setInterval(() => {
                if (!GameManager.instance) return;
                const timeLeft = GameManager.instance.timeLeft;
                cc.log('[GameNetworkBridge] Host 廣播計時器:', timeLeft);
                if (window._nm && typeof timeLeft === 'number') {
                    window._nm.sendGameEvent(EV_TICK_SYNC, {
                        timeLeft: timeLeft,
                    });
                }
            }, 500);
        }
    },

    onDestroy() {
        EventBus.off('player:moved',        this._onLocalMove,    this);
        EventBus.off('station:pickup',      this._onLocalPickup,  this);
        EventBus.off('station:place',       this._onLocalPlace,   this);
        EventBus.off('station:serve',       this._onLocalServe,   this);
        EventBus.off('game:score',          this._onLocalScore,   this);
        EventBus.off('skill:local',         this._onLocalSkill,   this);
        EventBus.off('guide:local_complete', this._onGuideComplete, this);
        EventBus.off('game:start',          this._onGameStart,    this);
        EventBus.off('bb:local_pickup',     null,                 this);
        EventBus.off('bb:local_score',      null,                 this);
        EventBus.off('bb:local_seed',       null,                 this);
        EventBus.off('bb:local_serve',      null,                 this);

        if (window._nm) {
            window._nm.off('game_event', this._onGameEvent);
        }

        // 清除計時器同步
        if (this._timerSyncSchedule) {
            clearInterval(this._timerSyncSchedule);
            this._timerSyncSchedule = null;
        }
    },

    // ─── Local → Remote ──────────────────────────────────

    _handleLocalMove(data) {
        if (data.playerId !== this._localId) return;
        if (!window._nm) return;

        window._nm.sendGameEvent(EV_MOVE, {
            x:      data.x,
            y:      data.y,
            facing: data.facing,
            char:   window._selectedCharacter || 'character-a',  // 每幀夾帶，確保對方收到
        });
    },

    _handleLocalPickup(data) {
        // 在 _applyRemoteStation 內部呼叫 station.onInteract 會觸發 _onPickup/_onPlace
        // 而它們又會 emit 'station:pickup'/'station:place'，那會被我們自己接到再廣播
        // 回去造成 echo 無限迴圈，避免把 remote 端 avatar 卡在 HOLDING 狀態。
        if (this._applyingRemote) return;
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_STATION, {
            action:      'pickup',
            stationType: data.stationType,
            col:         data.col,
            row:         data.row,
            item:        data.item || null,
        });
    },

    _handleLocalPlace(data) {
        if (this._applyingRemote) return;   // 同上，避免 echo
        if (!window._nm) return;
        // Bug 3 fix: ServingCounter interactions are synced via EV_SERVE (station:serve),
        // NOT through EV_STATION, to prevent double-scoring on the remote side.
        if (data.stationType === 'SERVING') return;
        window._nm.sendGameEvent(EV_STATION, {
            action:      'place',
            stationType: data.stationType,
            col:         data.col,
            row:         data.row,
            item:        data.item || null,
        });
    },

    _handleLocalServe(data) {
        if (this._applyingRemote) return;
        // Only sync successful serves to avoid syncing failed attempts
        if (!data.success || !window._nm) return;
        window._nm.sendGameEvent(EV_SERVE, {
            col:     data.col,
            row:     data.row,
            item:    data.item,
            orderId: typeof data.orderId === 'number' ? data.orderId : -1,
        });
    },

    _handleLocalScore(data) {
        // 分數改變時，廣播給對方
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_SCORE_SYNC, {
            score: data.score,
        });
    },

    // ─── Remote → Local ──────────────────────────────────

    _applyGameEvent(msg) {
        const { code, data } = msg;
        if (!data) return;

        // code 100: player_ready 信號（等待兩人進場）
        if (code === 100 && data && data.action === 'player_ready') {
            this._onRemotePlayerReady(data);
            return;
        }

        // code 20: 計時器同步（只有 Guest 需要接收）
        if (code === EV_TICK_SYNC) {
            this._applyRemoteTickSync(data);
            return;
        }

        // code 21: 分數同步（只有 Guest 需要接收對方的分數）
        if (code === EV_SCORE_SYNC) {
            this._applyRemoteScoreSync(data);
            return;
        }

        // 其他遊戲事件
        if      (code === EV_MOVE)    this._applyRemoteMove(data);
        else if (code === EV_STATION) this._applyRemoteStation(data);
        else if (code === EV_SERVE)   this._applyRemoteServe(data);
        else if (code === EV_SKILL)   this._applyRemoteSkill(data);
        else if (code === EV_GUIDE)   this._applyRemoteGuide();
        // ── Burger Battle ──
        else if (code === EV_BB_SEED)   this._applyBBSeed(data);
        else if (code === EV_BB_PICKUP) this._applyBBPickup(data);
        else if (code === EV_BB_SCORE)  this._applyBBScore(data);
        else if (code === EV_BB_SERVE)  this._applyBBServe(data);
        else if (code === EV_BB_END)    this._applyBBEnd(data);
    },

    // ── 技能同步 ──────────────────────────────────────────

    _handleLocalSkill(data) {
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_SKILL, {
            skill: data.skill,
            x:    data.x,
            y:    data.y,
            seed: data.seed,
            mode: data.mode,
        });
    },

    _applyRemoteSkill(data) {
        EventBus.emit('skill:remote', {
            skill: data.skill,
            x:    data.x,
            y:    data.y,
            seed: data.seed,
            mode: data.mode,
        });
    },

    // ── 關卡說明 Guide ────────────────────────────────────

    // Host 長按完成 → 廣播給 Guest
    _handleGuideComplete() {
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_GUIDE, {});
    },

    // Guest 收到 → 通知 GuideOverlay 開始遊戲
    _applyRemoteGuide() {
        EventBus.emit('guide:remote_complete');
    },

    // game:start 觸發後才啟動計時器同步（Host 定期廣播給 Guest）
    _handleGameStart() {
        this._setupTimerSync();
    },

    _applyRemoteTickSync(data) {
        // Guest 接收 Host 廣播的計時器，強制同步本地計時器
        if (this._role === 'host') return;  // Host 不接收自己的廣播
        if (!GameManager.instance) return;
        if (typeof data.timeLeft !== 'number') {
            cc.error('[GameNetworkBridge] 計時器數據無效:', data.timeLeft);
            return;
        }

        const gm = GameManager.instance;

        // 把 _startTime 反算對齊 Host 廣播的 timeLeft，這樣本地 _tick 的 wall-clock 計算
        // 會跟 Host 同步；視窗最小化恢復後，_tick 自動補上錯過的秒數。
        // 公式：_startTime = now - elapsed * 1000，其中 elapsed = totalTime - timeLeft
        gm._startTime = Date.now() - (gm.totalTime - data.timeLeft) * 1000;
        gm._timeLeft  = data.timeLeft;

        EventBus.emit('game:tick', { timeLeft: Math.max(0, Math.ceil(data.timeLeft)) });
    },

    _applyRemoteScoreSync(data) {
        // Guest 接收 Host 廣播的分數，更新本地分數
        if (this._role === 'host') return;  // Host 不需要接收自己的廣播

        if (!GameManager.instance) return;
        // 強制同步分數
        GameManager.instance._score = data.score;
        EventBus.emit('game:score', { score: data.score });
    },

    // ── burger_battle fallback helper ─────────────────────────

    /** 取得遠端玩家 PlayerController（有 GameManager 用 GM，否則從 Canvas 找）*/
    _getRemotePlayerFallback() {
        if (GameManager.instance) {
            return GameManager.instance.getPlayer(this._remoteId);
        }
        const PC = require('../player/PlayerController');
        const canvas = cc.find('Canvas');
        if (!canvas) return null;
        for (const child of canvas.children) {
            const pc = child.getComponent(PC);
            if (pc && pc.playerId === this._remoteId) return pc;
        }
        return null;
    },

    /** 取得站台（有 GameManager 用 GM，否則用 StationBase._registry）*/
    _getStationFallback(col, row) {
        if (GameManager.instance) {
            return GameManager.instance.getStation(col, row);
        }
        const SB = require('../station/StationBase');
        return (SB._registry && SB._registry.get(`${col},${row}`)) || null;
    },

    // ──────────────────────────────────────────────────────────

    _applyRemoteMove(data) {
        const remote = this._getRemotePlayerFallback();
        if (!remote) { cc.log('Bridge: 找不到 remoteId =', this._remoteId); return; }
        remote.applyNetworkState(data.x, data.y, data.facing);

        // 收到對方夾帶的角色選擇，更新遠端玩家 sprite
        if (data.char) {
            if (data.char !== window._remoteCharacter) {
                window._remoteCharacter = data.char;
                cc.log('Bridge: 遠端角色更新:', data.char, 'remoteId=', this._remoteId);
            }
            const AnimationController = require('../player/AnimationController');
            const anim = remote.node.getComponent(AnimationController);
            if (anim) {
                anim.loadCharacter(data.char);   // AnimCtrl 內部防重複，安全
            } else {
                cc.warn('Bridge: 找不到 AnimationController，node:', remote.node.name);
            }
        }
    },

    // Bug 4 fix: properly replay station interactions using the 'action' field.
    // pickup — create/take item and give to remote player
    // place  — force remote player to HOLDING, then let onInteract trigger _onPlace
    _applyRemoteStation(data) {
        cc.log('Bridge: 收到遠端站台互動', JSON.stringify(data));

        const station = this._getStationFallback(data.col, data.row);
        const remote  = this._getRemotePlayerFallback();
        if (!station || !remote) return;

        const CarryState = require('../player/PlayerController').CarryState;

        // 標記正在套用遠端事件，避免下游 station.onInteract 觸發的 EventBus emit
        // 被自己的 _handleLocalPickup / _handleLocalPlace 又廣播回去（echo loop）。
        this._applyingRemote = true;
        try {
            if (data.action === 'pickup') {
                if (data.stationType === 'FOOD_BOX') {
                    // FoodBox: always generate a new item node.
                    // station 本身就是 FoodBox component（StationBase.registerStation
                    // 註冊的是 subclass instance），可以直接讀它的 foodSpriteFrame /
                    // foodScale，讓對方手上的食材在我這邊也看得到。
                    //
                    // 順序要對齊 FoodBox._onPickup：先 setScale，addComponent 後先設
                    // spriteFrame（讓 node 自動 resize 到 sprite 原始尺寸），最後鎖
                    // sizeMode = CUSTOM。如果先鎖 CUSTOM 再 setSpriteFrame，node 維持
                    // 在 100x100 不會 resize，乘上 foodScale (0.07) 之後變超小看不到。
                    const itemNode = new cc.Node(data.item || 'food');
                    itemNode.width  = 100;
                    itemNode.height = 100;
                    if (typeof station.foodScale === 'number') {
                        itemNode.setScale(station.foodScale);
                        itemNode._carryScale = station.foodScale;
                    }
                    const sprite = itemNode.addComponent(cc.Sprite);
                    ItemSprites.applySpriteFrame(itemNode, itemNode.name, station.foodSpriteFrame);
                    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
                    remote.pickUp(itemNode);
                } else {
                    // Regular / CookingStation: take the held item from the station.
                    // Force-clear cooking state first so _onPickup's guard passes.
                    if (station._heldItem) {
                        station._cooking = false;
                        station._isDone  = false;
                        remote.pickUp(station._heldItem);
                        station._heldItem = null;
                    } else {
                        // Item not on this side yet (race), create a proxy node
                        const itemNode = new cc.Node(data.item || 'item');
                        itemNode.width  = 40;
                        itemNode.height = 40;
                        itemNode.addComponent(cc.Sprite);   // 至少有 component
                        remote.pickUp(itemNode);
                    }
                }

            } else if (data.action === 'place') {
                if (!data.item) return;
                // 如果 remote 已經因為之前的 pickup 事件拿著 item（含 sprite），就直接
                // 走 station.onInteract 把它從玩家身上轉移到 station 上，這樣 sprite
                // 不會掉。只有在 race（漏接 pickup）的情況才建立空白 proxy 當 fallback。
                if (!remote.isCarrying()) {
                    const proxy = new cc.Node(data.item);
                    proxy.width  = 40;
                    proxy.height = 40;
                    proxy.addComponent(cc.Sprite);
                    remote._heldItem   = proxy;
                    remote._carryState = CarryState.HOLDING;
                }
                station.onInteract(remote);
            }
        } finally {
            this._applyingRemote = false;
        }
    },

    // Bug 3 fix: remote side received a successful serve event.
    // Remove the matching order from local OrderManager (without scoring),
    // then add the score and update HUD directly.
    _applyRemoteServe(data) {
        cc.log('Bridge: 收到遠端出餐', JSON.stringify(data));

        const OrderManager = require('../station/OrderManager');
        // 優先用 orderId 精準移除；舊版送的事件可能沒帶 orderId，fallback 回 recipe 配對。
        // 用 id 可以避免「兩邊各自配到不同的同名訂單」造成 UI 不一致。
        let result;
        if (OrderManager.instance) {
            if (typeof data.orderId === 'number' && data.orderId >= 0) {
                result = OrderManager.instance.consumeOrderById(data.orderId);
                // 已被本地 update 過期掉了 → no-op，分數靠 EV_SCORE_SYNC 同步
                if (!result.found) {
                    cc.log('Bridge: orderId', data.orderId, '在本地已不存在（可能已過期），略過');
                    return;
                }
            } else {
                result = OrderManager.instance.consumeOrderByRecipe(data.item);
            }
        } else {
            result = { id: -1, reward: 0 };
        }

        if (result.reward > 0 && GameManager.instance) {
            GameManager.instance.addScore(result.reward);
        }

        EventBus.emit('order:completed', {
            id:     result.id,
            recipe: data.item,
            score:  result.reward,
        });
    },

    // 收到遠端角色選擇，更新遠端玩家的 Sprite
    _applyRemoteChar(data) {
        cc.log('Bridge: 收到遠端角色選擇:', data.charId);
        window._remoteCharacter = data.charId;

        // 通知遠端玩家的 AnimationController 重新載入 sprite
        if (!GameManager.instance) return;
        const remote = GameManager.instance.getPlayer(this._remoteId);
        if (!remote) return;

        // 用 class 引用查找（比字串更可靠）
        const AnimationController = require('../player/AnimationController');
        const anim = remote.node.getComponent(AnimationController);
        if (anim) {
            anim.loadCharacter(data.charId);
        } else {
            cc.warn('Bridge: 找不到遠端 AnimationController，remoteId=', this._remoteId);
        }
    },

    // ══════════════════════════════════════════════════════════
    //  Burger Battle 網路事件（本地 → 廣播）
    // ══════════════════════════════════════════════════════════

    /** Host 廣播帶子 seed */
    _handleBBSeed(data) {
        if (!window._nm || this._role !== 'host') return;
        window._nm.sendGameEvent(EV_BB_SEED, { seed: data.seed });
        cc.log('[BB Bridge] 廣播 seed =', data.seed);
    },

    /** 本地撿起帶子食材 → 廣播 */
    _handleBBPickup(data) {
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_BB_PICKUP, {
            col:      data.col,
            idx:      data.idx,
            foodType: data.foodType,
            playerId: data.playerId,
        });
    },

    /** 本地分數更新 → 廣播 */
    _handleBBScore(data) {
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_BB_SCORE, {
            playerId: data.playerId,
            score:    data.score,
        });
    },

    /** 本地出餐 → 廣播 */
    _handleBBServe(data) {
        if (!window._nm) return;
        window._nm.sendGameEvent(EV_BB_SERVE, {
            playerId: data.playerId,
        });
    },

    // ══════════════════════════════════════════════════════════
    //  Burger Battle 網路事件（遠端 → 本地套用）
    // ══════════════════════════════════════════════════════════

    /** Guest 收到 seed → 初始化帶子 */
    _applyBBSeed(data) {
        cc.log('[BB Bridge] 收到 seed =', data.seed);
        EventBus.emit('bb:remote_seed', { seed: data.seed });
    },

    /** 遠端撿走帶子食材 → 本地移除 + 讓 remote player 拿著對應食材 */
    _applyBBPickup(data) {
        const ConveyorBelt = require('./ConveyorBelt');
        for (const belt of ConveyorBelt.instances) {
            if (belt && belt.beltCol === data.col) {
                belt.removeItemByIdx(data.idx);
                break;
            }
        }

        // 讓對方端的 remote player 拿著對應食材，否則後續他放上桌時 _applyRemoteStation
        // 的 fallback 會建空白 proxy，桌上看不到食材。foodType 從廣播取（舊版沒帶就跳過）。
        if (!data.foodType) return;
        const remote = this._getRemotePlayerFallback();
        if (!remote || remote.isCarrying()) return;

        const node = new cc.Node(data.foodType);
        node.setContentSize(52, 52);
        node._foodType = data.foodType;
        const sp = node.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        ItemSprites.applySpriteFrame(node, data.foodType);
        remote.pickUp(node);
    },

    /** 遠端分數更新 → 更新 HUD */
    _applyBBScore(data) {
        EventBus.emit('bb:remote_score', { playerId: data.playerId, score: data.score });
    },

    /** 遠端出餐成功 → 本地對應的 remote player drop + destroy 持有食材 */
    _applyBBServe(data) {
        const remote = this._getRemotePlayerFallback();
        if (!remote || !remote.isCarrying()) return;
        const item = remote.dropItem();
        if (item && cc.isValid(item)) item.destroy();
        cc.log('[BB Bridge] 遠端 P' + data.playerId + ' 出餐，本地 drop remote player 食材');
    },

    /** Host 廣播遊戲結束 → Guest 跳到結算 */
    _applyBBEnd(data) {
        cc.log('[BB Bridge] 收到遊戲結束 winner=', data.winner);
        EventBus.emit('bb:remote_end', {
            p1Score: data.p1Score,
            p2Score: data.p2Score,
            winner:  data.winner,
        });
    },
});
