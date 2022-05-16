const cretonconfig = require('./config');
const eapserial = require('./serial');
const webexroomssh = require('./webexroomssh');


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


function writeSerial(targetPort, command) {
    try {
        for (const port of cretonconfig.config.serialPorts) {
            if (targetPort == port.name) {
                //console.log(`Writing ${command} to ${targetPort}`);
                port.serialport.write(command);
            }
        }
    }
    catch (err) {
        console.log(`Error writing ${command} to port ${targetPort}: ${err}`);
    }
}
function serialCommand(targetPort, command, args) {
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
    if (DEBUG) console.log(`Searching for trigger "${text}"`);
    for (trigger of cretonconfig.config.triggers) {
        try {
            if (text == trigger.text) {
                match++;
                if (trigger.cancel) {
                    if (DEBUG) console.log(`Cancelling timer ${trigger.cancel}`);
                    try {
                        clearInterval(triggersTimers[trigger.cancel]);
                    } catch { }
                }
                writeSerial(trigger.serialPort, trigger.raw);
                var intervalTrigger = trigger;
                if (DEBUG) console.log(`Starting timer ${trigger.id}`);
                clearInterval(triggersTimers[trigger.id]);
                if (trigger.repeat) {
                    triggersTimers[trigger.id] = setInterval(() => {
                        writeSerial(intervalTrigger.serialPort, intervalTrigger.raw);
                    }, trigger.repeat);
                }
            }
        }
        catch (err) {
            console.log(`ERR processTriggers: ${err}`);
        }
    }
    if (DEBUG) console.log(`Found ${match} match for trigger "${text}"`);
}

function setupSerial() {
    for (const port of cretonconfig.config.serialPorts) {
        try {
            port.serialport = new eapserial.SerialPort(port, DEBUG);
            if (port.read) {
                port.serialport.read(data => {
                    codec.sendMessage(getDataPacket(port.name, data));
                });
                port.serialport.feedback(feedback => {
                    var x = getFeedbackPacket(port.name, feedback.f, feedback.d);
                    codec.sendMessage(getFeedbackPacket(port.name, feedback.f, feedback.d));
                });
            }
        }
        catch (err) {
            console.log(`SERIAL INIT ERROR: ` + err);
        }
    }
    for (trigger of cretonconfig.config.triggers) {
        if (trigger.onStart) {
            if (DEBUG)
                console.log(`Found on-start trigger. Executing ${trigger.id}`);
            processTriggers(trigger.text);
        }
    }
}

function messageReceived(message) {
    try {
        var jsm = JSON.parse(value.Text);
        switch (jsm.$.t) {
            case 5:
                writeSerial(jsm.$.p, jsm.$.d);
                break;
            case 6:
                serialCommand(jsm.$.p, jsm.$.c, jsm.$.a);
        }
    }
    catch (e) {
        processTriggers(value.Text);
    }
}

function init() {
    console.log(`Starting....`);
    const auth = cretonconfig.config.codec.auth;
    const info = cretonconfig.config.codec.info;

    codec = new webexroomssh.Codec(info, auth, true);
    codec.on('connect', () => {
        console.log(`CRETON: Codec is connected!`);
        setupSerial();
    });

    codec.on('disconnect', reason => {
        console.log(`CRETON: Codec is disconnected. ReasoN: ${reason}`);
        codec.connect();
    });

    codec.on('connecting', () => {
        console.log(`CRETON: Codec is connecting.`);
    });

    codec.on('message', message => messageReceived(message));

    codec.connect();

}

init();

