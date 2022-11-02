const jsxapi = require('jsxapi');
/*
Name: webexroomssh
Author: Zacharie.Gignac.1@ulaval.ca
Version: v1.0

usage:

const auth = {
    username:'MyUsername',
    password:'MySuperSecretPassword
};

const codecInfo = {
    ip:'1.1.1.1',
    serialNumber:'123456789',
    name:'TheNameOfMySystem'
    
}
    const codecInfo = {
        ip: '10.1.48.247',
        serialNumber: 'cretonpve1115',
        id:'cretonpasfrais',
        name:'CretonPasFrais'

    }

    var c = new Codec(codecInfo, auth, true);
    c.on('event here')

Events:
    * connect
    * connecting
    * ignoreconnect [reason]
    * maxreconnectreached [attempts]
    * disconnect [reason]
    * message [message]

*/
var DEBUG = false;

const PERIPHERAL_ID = 'WebexRoomSSH';
const PERIPHERAL_SOFTWAREVERSION = 'v1.0';

const EVENT_CONNECT = 'connect';
const EVENT_DISCONNECT = 'disconnect';
const EVENT_CONNECTING = 'connecting';
const EVENT_MESSAGE = 'message';
const EVENT_IGNORECONNECT = 'ignoreconnect';
const EVENT_MAXRECONNECTREACHED = 'maxreconnectreached';

const DISCONNECTED = 0;
const CONNECTED = 1;
const CONNECTING = 2;

var connectionAttemptsFail = 0;

function log(text) {
    if (DEBUG) console.log(text);
}
function warn(text) {
    console.warn(text);
}
function err(text) {
    console.error(text);
}

module.exports.Codec = class Codec {
    constructor(codecInfo, auth, debug = false) {
        log('[wrssh.] initializing');
        DEBUG = debug;
        this.state = DISCONNECTED;
        this.xapi = undefined;
        this.codecInfo = codecInfo;
        this.auth = auth;
        this.events = [];
        this.hbTimer = undefined;
        this.timeout = undefined;
        this.doTimeoutCheck = false;
        console.log(this.codecInfo);
        if (!this.codecInfo.maxConnectionAttempts) {
            this.codecInfo.maxConnectionAttempts = 10;
        }
        if (!this.codecInfo.reconnectInterval) {
            this.codecInfo.reconnectInterval = 15000;
        }
        log('[wrssh.] initialized');
    }

    on(event, callback) {
        this.events[event] = callback;
    }

    raiseEvent(event, payload) {
        if (this.events[event]) {
            this.events[event](payload);
        }
    }

    connect() {
        if (this.state == DISCONNECTED) {
            var that = this;
            this.state = CONNECTING;
            this.raiseEvent(EVENT_CONNECTING);
            console.log(`[wrssh.connect]: Connecting to ${that.codecInfo.ip}`);
            that.xapi = jsxapi.connect(`ssh://${that.codecInfo.ip}`, that.auth)
                .on('error', (errmsg) => {
                    connectionAttemptsFail++;
                    that.state = DISCONNECTED;
                    that.xapi.close();
                    if (connectionAttemptsFail == this.codecInfo.maxConnectionAttempts) {
                        that.raiseEvent(EVENT_MAXRECONNECTREACHED,this.codecInfo.maxConnectionAttempts);
                    }
                    else {
                        that.raiseEvent(EVENT_DISCONNECT, errmsg);
                    }
                    err(`[wrssh.connect] Connection error. ${connectionAttemptsFail}/${this.codecInfo.maxConnectionAttempts}`);
                    this.stopHearthbeat();
                    that.xapi.close();
                })
                .on('ready', async (x) => {
                    connectionAttemptsFail = 0;
                    that.state = CONNECTED;
                    that.registerPeripheral();
                    that.raiseEvent(EVENT_CONNECT);
                    that.startTimeoutCheck();
                    that.xapi.Event.Message.Send.on(message => {
                        that.raiseEvent(EVENT_MESSAGE, message);
                    });
                    this.startHearthbeat();
                });
        }
        else {
            this.raiseEvent(EVENT_IGNORECONNECT, `Cannot connect while current state is ${this.state}`);
        }
    }



    registerPeripheral() {
        this.xapi.Command.Peripherals.Connect({
            ID: PERIPHERAL_ID,
            Name: this.codecInfo.name,
            SerialNumber: this.codecInfo.serialNumber,
            SoftwareInfo: PERIPHERAL_SOFTWAREVERSION,
            Type: 'ControlSystem'
        });
    }

    async timeoutCheck() {
        if (this.state == CONNECTED) {
            log(`[wrssh.timeoutCheck] PING?`);
            var that = this;
            this.timeout = setTimeout(() => {
                that.stopTimeoutCheck();
                that.stopHearthbeat();
                that.state = DISCONNECTED;
                that.xapi.close();
                that.raiseEvent(EVENT_DISCONNECT, 'PING_TIMEOUT');
            }, 5000);
            var systemName = await this.xapi.Config.SystemUnit.Name.get();
            log(`[wrssh.timeoutCheck] PONG!`);
            clearTimeout(this.timeout);
            this.timeout = undefined;
            if (this.doTimeoutCheck) {
                setTimeout(() => { that.timeoutCheck(); }, 10000);
            }
        }
    }

    startTimeoutCheck() {
        log(`[wrssh.startTimeoutCheck] Starting timeout check`);
        this.doTimeoutCheck = true;
        this.timeoutCheck();
    }

    stopTimeoutCheck() {
        log(`[wrssh.stopTimeoutCheck] Stopping timeout check`);
        this.doTimeoutCheck = false;
    }

    startHearthbeat() {
        log(`[wrssh.startHeartbeat] Starting hearthbeat`);
        var that = this;
        this.hbTimer = setInterval(() => {
            log(`[wrssh.startHearthbeat] PING?`);
            that.xapi.Command.Peripherals.HeartBeat({
                ID: PERIPHERAL_ID
            });
        }, 10000);
    }

    stopHearthbeat() {
        log(`[wrssh.stopHearthbeat] Stopping hearthbeat`);
        clearTimeout(this.hbTimer);
        this.hbTimer = undefined;
    }

    sendMessage(message) {
        //TEMPORARY FIX, REPLACE ":" WITH NOTHING
        //message = message.toString().replace(/:/g,'');
        this.xapi.Command.Message.Send({ text: message }).catch(err => {
            console.log(`[wrssh.sendMessage] ERROR: ${err.message}`);
        });
    }
}



