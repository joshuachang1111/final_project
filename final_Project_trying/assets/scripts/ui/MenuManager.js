cc.Class({
    extends: cc.Component,

    properties: {
        mainPanel:      { default: null, type: cc.Node },
        hostPanel:      { default: null, type: cc.Node },
        joinPanel:      { default: null, type: cc.Node },
        roomCodeLabel:  { default: null, type: cc.Label },
        waitingLabel:   { default: null, type: cc.Label },
        codeInput:      { default: null, type: cc.EditBox },
        joinErrorLabel: { default: null, type: cc.Label },
    },

    onLoad() {
        this._showMain();
        this.scheduleOnce(() => this._setupNetworkCallbacks(), 0);
    },

    _setupNetworkCallbacks() {
        const nm = window._nm;
        if (!nm) {
            cc.error('NetworkManager 找不到！請確認場景裡有 NetworkManager 節點並掛上腳本');
            return;
        }

        nm.on('connecting', () => {
            this.waitingLabel.node.active = true;
            this.waitingLabel.string = '連線中，請稍候...';
            this._showHost();
        });

        nm.on('room_created', (msg) => {
            cc.log('room_created 收到，code =', msg.code, '，roomCodeLabel =', this.roomCodeLabel);
            this.roomCodeLabel.string = msg.code;
            this.waitingLabel.string = '等待另一位玩家加入...';
            this._showHost();
        });

        nm.on('start_game', (msg) => {
            cc.sys.localStorage.setItem('playerRole', msg.role);
            cc.director.loadScene('game');
        });

        nm.on('error', (msg) => {
            this.joinErrorLabel.string = msg.message;
            this.joinErrorLabel.node.active = true;
        });

        nm.on('player_disconnected', () => {
            this._showMain();
        });

        cc.log('MenuManager: NetworkManager 綁定成功');
    },

    _showMain() {
        this.mainPanel.active = true;
        this.hostPanel.active = false;
        this.joinPanel.active = false;
    },

    _showHost() {
        this.mainPanel.active = false;
        this.hostPanel.active = true;
        this.joinPanel.active = false;
    },

    _showJoin() {
        this.mainPanel.active = false;
        this.hostPanel.active = false;
        this.joinPanel.active = true;
        this.joinErrorLabel.node.active = false;
        this.codeInput.string = '';
    },

    onCreateRoom() {
        cc.log('onCreateRoom clicked');
        const nm = window._nm;
        if (!nm || !cc.isValid(nm.node)) {
            cc.error('NetworkManager 不存在或已銷毀');
            return;
        }
        nm.createRoom();
    },

    onJoinRoomBtn() {
        this._showJoin();
    },

    onConfirmJoin() {
        const code = this.codeInput.string.trim();
        if (code.length !== 4 || isNaN(code)) {
            this.joinErrorLabel.string = '請輸入 4 位數字代碼';
            this.joinErrorLabel.node.active = true;
            return;
        }
        const nm = window._nm;
        if (nm) nm.joinRoom(code);
    },

    onBack() {
        this._showMain();
    },
});
