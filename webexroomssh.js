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
    * disconnect [reason]
    * message [message]

*/
var debug_log = true;

const PERIPHERAL_ID = 'WebexRoomSSH';
const PERIPHERAL_SOFTWAREVERSION = 'v1.0';

const EVENT_CONNECT = 'connect';
const EVENT_DISCONNECT = 'disconnect';
const EVENT_CONNECTING = 'connecting';
const EVENT_MESSAGE = 'message';

const DISCONNECTED = 0;
const CONNECTED = 1;
const CONNECTING = 2;


function log(text) {
    if (debug_log) console.log(text);
}
function warn(text) {
    if (debug_log) console.warn(text);
}
function err(text) {
    if (debug_log) console.error(text);
}

module.exports.Codec = class Codec {
    constructor(codecInfo, auth, debug = false) {
        log('CODEC: initializing');
        debug_log = debug;
        this.state = DISCONNECTED;
        this.xapi = undefined;
        this.codecInfo = codecInfo;
        this.auth = auth;
        this.events = [];
        this.hbTimer = undefined;
        this.timeout = undefined;
        this.doTimeoutCheck = false;
        log('CODEC: initialized');
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
        this.state = CONNECTING;
        this.raiseEvent(EVENT_CONNECTING);
        log(`CODEC: Connecting to ${this.codecInfo.ip}`)
        this.xapi = jsxapi.connect(`ssh://${this.codecInfo.ip}`, this.auth)
            .on('error', () => {
                this.state = DISCONNECTED;
                this.xapi.close();
                this.raiseEvent(EVENT_DISCONNECT, `SSH_CONNECTION_BROKEN`);
                err(`CODEC: Connection error!`);
            })
            .on('ready', async (x) => {
                this.state = CONNECTED;
                this.registerPeripheral();
                this.raiseEvent(EVENT_CONNECT);
                this.startTimeoutCheck();
                this.xapi.Event.Message.Send.on(message => {
                    this.raiseEvent(EVENT_MESSAGE,message);
                });

            });
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
            log(`CODEC: PING?`);
            var that = this;
            this.timeout = setTimeout( () => {
                that.stopTimeoutCheck();
                that.stopHearthbeat();
                that.state = DISCONNECTED;
                that.xapi.close();
                that.raiseEvent(EVENT_DISCONNECT, 'PING_TIMEOUT');
            }, 5000);
            var systemName = await this.xapi.Config.SystemUnit.Name.get();
            log(`CODEC: PONG!`);
            clearTimeout(this.timeout);
            this.timeout = undefined;
            if (this.doTimeoutCheck) {
                setTimeout(() => { that.timeoutCheck(); }, 10000);
            }

        }
    }

    startTimeoutCheck() {
        log(`CODEC: Starting timeout check`);
        this.doTimeoutCheck = true;
        this.timeoutCheck();
    }

    stopTimeoutCheck() {
        log(`CODEC: Stopping timeout check`);
        this.doTimeoutCheck = false;
    }

    startHearthbeat() {
        log(`CODEC: Starting hearthbeat`);
        this.hbTimer = setInterval(() => {
            log(`PING?`);
            this.xapi.Command.Peripherals.HeartBeat({
                ID: PERIPHERAL_ID
            });
        }, 10000);
    }

    stopHearthbeat() {
        log(`CODEC: Stopping hearthbeat`);
        clearTimeout(this.hbTimer);
        this.hbTimer = undefined;
    }

    sendMessage(message) {
        try {
        this.xapi.Command.Message.Send({text:message});
        }
        catch(err) {
            err(`CODEC: sendMessage error: ${err}`);
        }
    }
}



