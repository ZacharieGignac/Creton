const cretonconfig = require('./config');
const eapserial = require('./serial');
const webexroomssh = require('./webexroomssh');

const tel = require('./telemetry');


const MSG_INIT_START = { $: { t: 1 } };
const MSG_INIT_STOP = { $: { t: 2 } };
const MSG_PORT_DECLARATION = { $: { t: 3 } }; //this is for something, future use
const MSG_RAWDATA = { $: { t: 4 } };
const MSG_SENDRAW = { $: { t: 5 } };
const MSG_SERIALCOMMAND = { $: { t: 6 } };
const MSG_FEEDBACK = { $: { t: 7 } };

const DEBUG = cretonconfig.config.debug;

var triggersTimers = [];

var codec = undefined;
var serialIsSet = false;
var telemetryEnabled = false;

function disp(text) {
    console.log(text);
}

function log(text) {
    if (cretonconfig.config.debug) {
        console.log(text);
    }
}
function err(text) {
    console.error(text);
}
function warn(text) {
    if (cretonconfig.config.debug) {
        console.warn(text);
    }
}


function writeSerial(targetPort, command) {
    var strcmd = command.replace(`\r`, `\\r`);
    log(`[writeSerial] port=${targetPort} command=${strcmd}`);
    try {
        for (const port of cretonconfig.config.serialPorts) {
            if (targetPort == port.name) {
                port.serialport.write(command);
            }
        }
    }
    catch (err) {
        err(`[writeSerial] Error writing "${strcmd}" to port "${targetPort}": ${err}`);
    }
}
function serialCommand(targetPort, command, args) {
    log(`[serialCommand] targetPort=${targetPort} command=${command} args=${args}`);
    for (const port of cretonconfig.config.serialPorts) {
        if (targetPort == port.name) {
            port.serialport.command(command, args);
        }
    }
}

function getDataPacket(source, data) {
    var msg = MSG_RAWDATA;
    msg.$.d = data;
    msg.$.n = source;
    return msg;
}
function getFeedbackPacket(source, feedback, data) {
    var msg = MSG_FEEDBACK;
    msg.$.n = source;
    msg.$.f = feedback;
    msg.$.d = data;
    return msg;
}


function processTriggers(text) {
    var match = 0;
    log(`[processTriggers] Searching for trigger "${text}"`);
    if (text == `SYSTEM_CRESTRON_REBOOT`) {
        disp(`[processTriggers] Received SYSTEM_CRESTRON_REBOOT`);
        process.exit(1);
    }
    else if (text == `HW_RESTART`) {
        disp(`[processTriggers] Received HW_RESTART`);
        process.exit(1);
    }
    else if (text == `SW_RESTART`) {
        disp(`[processTriggers] Received SW_RESTART`);
        process.exit(1);
    }
    else {
        for (trigger of cretonconfig.config.triggers) {
            try {
                if (text == trigger.text) {
                    match++;
                    if (trigger.cancel) {
                        log(`[processTriggers] Cancelling timer ${trigger.cancel}`);
                        try {
                            clearInterval(triggersTimers[trigger.cancel]);
                        } catch { }
                    }
                    writeSerial(trigger.serialPort, trigger.raw);
                    if (trigger.telemetrypath && trigger.telemetryvalue && telemetryEnabled) {
                        tel.publish(trigger.telemetrypath, trigger.telemetryvalue);
                    }
                    var intervalTrigger = trigger;
                    log(`[processTriggers] Starting timer ${trigger.id}`);
                    clearInterval(triggersTimers[trigger.id]);
                    if (trigger.repeat) {
                        triggersTimers[trigger.id] = setInterval(() => {
                            writeSerial(intervalTrigger.serialPort, intervalTrigger.raw);
                        }, trigger.repeat);
                    }
                }
            }
            catch (err) {
                err(`[processTriggers] ${err}`);
            }
        }
    }
    log(`[processTriggers] Found ${match} match for trigger "${text}"`);
}

function setupSerial() {
    for (const port of cretonconfig.config.serialPorts) {
        try {
            port.serialport = new eapserial.SerialPort(port, DEBUG);

            if (port.read) {
                port.serialport.read(data => {
                    var rawDataMessage = getDataPacket(port.name,data);
                    codec.sendMessage(rawDataMessage);
                    processSerialData(port.name, data);
                });
                port.serialport.feedback(feedback => {

                    var x = getFeedbackPacket(port.name, feedback.f, feedback.d);
                    codec.sendMessage(x);
                });
            }

        }
        catch (err) {
            err(`[setupSerial] Serial initialization error: ` + err);
        }
    }

    for (const trigger of cretonconfig.config.triggers) {
        if (trigger.onStart) {
            log(`[setupSerial] Found on-start trigger. Executing ${trigger.id}`);
            processTriggers(trigger.text);
        }
    }

    for (const sp of cretonconfig.config.serialParsing) {

        if (sp.serialPort.substring(0, 5) == 'fake-') {
            setInterval(() => {
                processSerialData(sp.serialPort, sp.fakeData);
            }, 5000);
        }

    }
    serialIsSet = true;
}
function processSerialData(port, data) {
    for (const sp of cretonconfig.config.serialParsing) {
        var telemetryValue = sp.match(data);
        if (telemetryValue) {
            if (sp.telemetrypath && telemetryEnabled) {
                log(`[processSerialData] Publishing telemetry ${sp.telemetrypath}=${telemetryValue}`);
                tel.publish(sp.telemetrypath, telemetryValue);
            }
        }
    }
}

function messageReceived(message) {
    try {
        var jsm = JSON.parse(message.Text);
        switch (jsm.$.t) {
            case 5:
                writeSerial(jsm.$.p, jsm.$.d);
                break;
            case 6:
                serialCommand(jsm.$.p, jsm.$.c, jsm.$.a);
        }
    }
    catch (e) {
        processTriggers(message.Text);
    }
}

function init() {
    disp(`[init] Starting....`);
    const auth = cretonconfig.config.codec.auth;
    const info = cretonconfig.config.codec.info;
    telemetryEnabled = cretonconfig.config.telemetry.enabled;

    codec = new webexroomssh.Codec(info, auth, cretonconfig.config.debug);
    codec.on('connect', () => {
        disp(`[init] Codec is connected!`);
        if (!serialIsSet) {
            setupSerial();
        }
    });

    codec.on('disconnect', reason => {
        err(`[init] Codec is disconnected. Reason: ${reason}`);
        setTimeout(() => {
            codec.connect();
        }, cretonconfig.config.codec.info.reconnectInterval);
    });

    codec.on('connecting', () => {
        disp(`[init] Codec is connecting.`);
    });

    codec.on('message', message => {
        messageReceived(message);
    });

    codec.on('ignorereconnect', reason => {
        warn(`[init] Ignoring connection request. Reason: ${reason}`);
    });

    codec.on('maxreconnectreached', attempts => {
        err(`[init] Max reconnection attempts reached (${attempts}). Exiting with status "EHOSTDOWN 112 Host is down"`);
        process.exit(112);
    });

    codec.connect();

    if (telemetryEnabled) {
        tel.init(cretonconfig.config.telemetry, cretonconfig.config.debug);
        tel.connect(() => {
            console.log(`Telemetry connected.`);
            tel.registerCommand(cretonconfig.config.telemetry.basepath + '/dev/creton/cmd', 'shutdown', command => {
                tel.publish('/dev/creton/cmd', 'ok');
                setTimeout(() => {
                    disp(`[telemetry] shutdown requested by incomming data 'shutdown' on topic /cmd.`);
                    process.exit(1);
                }, 1000);

            });
        });
    }
}

init();

