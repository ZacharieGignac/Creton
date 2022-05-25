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

function log(text) {
    if (cretonconfig.config.debug) {
        console.log(text);
    }
}


function writeSerial(targetPort, command) {
    var strcmd = command.replace(`\r`, `\\r`);
    log(`writeSerial port=${targetPort} command=${strcmd}`);
    try {
        for (const port of cretonconfig.config.serialPorts) {
            if (targetPort == port.name) {
                port.serialport.write(command);
            }
        }
    }
    catch (err) {
        console.log(`Error writing "${strcmd}" to port "${targetPort}": ${err}`);
    }
}
function serialCommand(targetPort, command, args) {
    log(`Serial command: targetPort=${targetPort} command=${command} args=${args}`);
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
    log(`Searching for trigger "${text}"`);
    for (trigger of cretonconfig.config.triggers) {
        try {
            if (text == trigger.text) {
                match++;
                if (trigger.cancel) {
                    log(`Cancelling timer ${trigger.cancel}`);
                    try {
                        clearInterval(triggersTimers[trigger.cancel]);
                    } catch { }
                }
                writeSerial(trigger.serialPort, trigger.raw);
                if (trigger.telemetrypath && trigger.telemetryvalue) {
                    tel.publish(trigger.telemetrypath, trigger.telemetryvalue);
                }
                var intervalTrigger = trigger;
                log(`Starting timer ${trigger.id}`);
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
    log(`Found ${match} match for trigger "${text}"`);
}

function setupSerial() {
    for (const port of cretonconfig.config.serialPorts) {
        try {
            port.serialport = new eapserial.SerialPort(port, DEBUG);
            
            if (port.read) {
                port.serialport.read(data => {
                    processSerialData(port.name,data);
                });
                port.serialport.feedback(feedback => {
                    
                    var x = getFeedbackPacket(port.name, feedback.f, feedback.d);
                    codec.sendMessage(x);
                });                
            }
            
        }
        catch (err) {
            console.log(`SERIAL INIT ERROR: ` + err);
        }
    }
    
    for (const trigger of cretonconfig.config.triggers) {
        if (trigger.onStart) {
            log(`Found on-start trigger. Executing ${trigger.id}`);
            processTriggers(trigger.text);
        }
    }

    for (const sp of cretonconfig.config.serialParsing) {
        
        if (sp.serialPort.substring(0,5) == 'fake-') {
            setInterval(()=> {
                processSerialData(sp.serialPort,sp.fakeData);
            },5000);
        }
        
    }
    serialIsSet = true;
}
function processSerialData(port, data) {
    for (const sp of cretonconfig.config.serialParsing) {
        var telemetryValue = sp.match(data);
        if (telemetryValue) {
            if (sp.telemetrypath) {
                log(`publishing telemetry ${sp.telemetrypath}=${telemetryValue}`);
                tel.publish(sp.telemetrypath,telemetryValue);
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
    console.log(`Starting....`);
    const auth = cretonconfig.config.codec.auth;
    const info = cretonconfig.config.codec.info;

    codec = new webexroomssh.Codec(info, auth, cretonconfig.config.debug);
    codec.on('connect', () => {
        console.log(`CRETON: Codec is connected!`);
	if (!serialIsSet) {
            setupSerial();
        }
    });

    codec.on('disconnect', reason => {
        console.log(`CRETON: Codec is disconnected. Reason: ${reason}`);
	setTimeout(() => {
	    codec.connect();
	},15000);
    });

    codec.on('connecting', () => {
        console.log(`CRETON: Codec is connecting.`);
    });

    codec.on('message', message => {
        messageReceived(message);
    });

    codec.connect();


    tel.init(cretonconfig.config.telemetry,cretonconfig.config.debug);
    tel.connect(() => {
        console.log(`Telemetry connected.`);
        tel.registerCommand(cretonconfig.config.telemetry.basepath + '/dev/creton/cmd','shutdown',command => {
            tel.publish('/dev/creton/cmd','ok');
            setTimeout(() => {
                process.exit(1);
            },1000);
            
        });
    });

}

init();

