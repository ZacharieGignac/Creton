const mqtt = require('mqtt');

var broker;
var mqttoptions;
var client;
var basePath;
var cbConnect;
var onlineInterval;
var DEBUG = false;
var commands = [];

function log(text) {
    if (DEBUG) {
        console.log(text);
    }
}
function sendOnline() {
    client.publish(basePath + '/dev/creton/online', new Date().toLocaleString(), { qos: 1, retain: true });
}

exports.connect = function (callback) {
    console.log(`TELEMETRY: Connecting to ${broker}...`);
    cbConnect = callback;
    client = mqtt.connect('mqtt://' + broker, mqttoptions);
    client.on('connect', event => {
        log(`TELEMETRY: Connected!`);
        if(cbConnect) cbConnect();
        sendOnline();
        clearInterval(onlineInterval);
        onlineInterval = setInterval(sendOnline,30000);
    });
    client.on('disconnect', event => {
        console.log(`TELEMETRY: Disconnected from ${broker}...`);
    });
    client.on('reconnect', event => {
        console.log(`TELEMETRY: Reconnecting...`);
    });
    client.on('error', event => {
        console.log(event);
    });
    client.on('message', (topic,payload) => {
        payload = payload.toString();
        for(const c of commands) {
            if (topic == c.topic) {
                if (payload.toString().substring(0,c.command.length) == c.command) {
                    c.callback(payload);
                }
            }
        }
    });
}

exports.init = function (config, debug=false) {
    log(`TELEMETRY: Init started...`);
    broker = config.broker;
    basePath = config.basepath;
    console.log(config.clientId);
    mqttoptions = {
        clientId: config.clientId + Math.floor(Math.random() * 1000000),
        username: config.username,
        password: config.password,
        clean: true,
        qos: 1,
        will: {
            topic: config.basepath + '/dev/creton/online',
            payload: 'offline'
        },
        reconnectPeriod:5000
    };
    log(`TELEMETRY: Init done!`);
}

exports.publish = function (topic, value, qos=1, retain=true) {
    client.publish(basePath + topic, value, { qos: qos, retain: retain });
}

exports.registerCommand = function(topic, command, callback) {
    client.subscribe(topic, function (err) {
        if (!err) {
            commands.push({
                topic:topic,
                command:command,
                callback:callback
            });
        }
    });
}