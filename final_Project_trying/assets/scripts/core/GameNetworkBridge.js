const EventBus    = require('./EventBus');
const GameManager = require('./GameManager');

// ── Photon event codes ────────────────────────────────────
const EV_MOVE    = 10;   // 玩家移動
const EV_STATION = 11;   // 站台互動（pickup / place）
const EV_SERVE   = 12;   // 出餐成功（用於同步分數與訂單移除，避免雙重計分）
const EV_CHAR    = 13;   // 角色選擇同步（遊戲開始時各自廣播）

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
        this._onGameEvent    = (msg) => this._applyGameEvent.call(this, msg);

        EventBus.on('player:moved',    this._onLocalMove,   this);
        EventBus.on('station:pickup',  this._onLocalPickup, this);
        EventBus.on('station:place',   this._onLocalPlace,  this);
        EventBus.on('station:serve',   this._onLocalServe,  this);

        if (window._nm) {
            window._nm.on('game_event', this._onGameEvent);
        }

        // 等待兩人都進場
        this._localReady = false;
        this._remoteReady = false;
        this._gameStarted = false;

        // 延遲一幀，等所有 onLoad 完成後，發送「我已進場」信號
        this.scheduleOnce(() => {
            cc.log('[GameNetworkBridge] 本地進場完成，發送 ready 信號');
            this._localReady = true;
            if (window._nm) {
                window._nm.sendGameEvent(100, { action: 'player_ready', role: this._role });
            }
            // 馬上檢查是否兩人都準備好
            this._checkBothReady();
        }, 0);

    },

    _onRemotePlayerReady(msg) {
        cc.log('[GameNetworkBridge] 收到對方進場信號');
        this._remoteReady = true;
        this._checkBothReady();
    },

    _checkBothReady() {
        if (this._gameStarted) {
            cc.log('[GameNetworkBridge] 遊戲已開始，忽略重複的 ready');
            return;
        }

        if (this._localReady && this._remoteReady) {
            this._gameStarted = true;
            cc.log('[GameNetworkBridge] ✓ 兩人都已進場，開始遊戲');
            if (GameManager.instance) {
                GameManager.instance.startGame();
            }
        }
    },

    onDestroy() {
        EventBus.off('player:moved',   this._onLocalMove,   this);
        EventBus.off('station:pickup', this._onLocalPickup, this);
        EventBus.off('station:place',  this._onLocalPlace,  this);
        EventBus.off('station:serve',  this._onLocalServe,  this);

        if (window._nm) {
            window._nm.off('game_event', this._onGameEvent);
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
        // Only sync successful serves to avoid syncing failed attempts
        if (!data.success || !window._nm) return;
        window._nm.sendGameEvent(EV_SERVE, {
            col:    data.col,
            row:    data.row,
            item:   data.item,
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

        // 其他遊戲事件
        if      (code === EV_MOVE)    this._applyRemoteMove(data);
        else if (code === EV_STATION) this._applyRemoteStation(data);
        else if (code === EV_SERVE)   this._applyRemoteServe(data);
    },

    _applyRemoteMove(data) {
        if (!GameManager.instance) return;
        const remote = GameManager.instance.getPlayer(this._remoteId);
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
        if (!GameManager.instance) return;

        const station = GameManager.instance.getStation(data.col, data.row);
        const remote  = GameManager.instance.getPlayer(this._remoteId);
        if (!station || !remote) return;

        const CarryState = require('../player/PlayerController').CarryState;

        if (data.action === 'pickup') {
            if (data.stationType === 'FOOD_BOX') {
                // FoodBox: always generate a new item node
                const itemNode = new cc.Node(data.item || 'noncooked_food');
                itemNode.width  = 40;
                itemNode.height = 40;
                itemNode.addComponent(cc.Sprite).spriteFrame = null;
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
                    itemNode.addComponent(cc.Sprite).spriteFrame = null;
                    remote.pickUp(itemNode);
                }
            }

        } else if (data.action === 'place') {
            if (!data.item) return;
            // Create item node and force remote player into HOLDING state,
            // then call onInteract so the station's _onPlace logic runs normally
            // (this also starts the cooking timer for CookingStations).
            const itemNode = new cc.Node(data.item);
            itemNode.width  = 40;
            itemNode.height = 40;
            itemNode.addComponent(cc.Sprite).spriteFrame = null;
            remote._heldItem   = itemNode;
            remote._carryState = CarryState.HOLDING;
            station.onInteract(remote);
        }
    },

    // Bug 3 fix: remote side received a successful serve event.
    // Remove the matching order from local OrderManager (without scoring),
    // then add the score and update HUD directly.
    _applyRemoteServe(data) {
        cc.log('Bridge: 收到遠端出餐', JSON.stringify(data));

        const OrderManager = require('../station/OrderManager');
        // consumeOrder returns the reward (0 if not found)
        const reward = OrderManager.instance
            ? OrderManager.instance.consumeOrder(data.item)
            : 0;

        if (reward > 0 && GameManager.instance) {
            GameManager.instance.addScore(reward);
        }

        // Emit order:completed so HUD removes the matching card
        EventBus.emit('order:completed', {
            id:     -1,
            recipe: data.item,
            score:  reward,
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
});
