

class SerialPort {
    constructor(config, dbg) {
        this.config = config;
        this.debug = dbg;
        if (config.driver) {
            var fs = require('fs');
            this.config.driver = JSON.parse(fs.readFileSync(this.config.driver, 'utf8'));
            this.config.baudRate = this.config.driver.Communication.Baud;
            this.timeBetweenCommands = this.config.driver.Communication.TimeBetweenCommands;
        }
        else {
            this.timeBetweenCommands = (this.config.timeBetweenCommands) ? this.config.timeBetweenCommands : 250;
            /* Set default serialport values if not defined in the config */
            if (!this.config.baudRate) this.config.baudRate = 9600;
            if (!this.config.parity) this.config.parity = 'none';
            if (!this.config.stopBits) this.config.stopBits = 1;
            if (!this.config.dataBits) this.config.dataBits = 8;
            if (!this.config.flowControl) this.config.flowControl = false;
        }

        const sp = require('serialport');
        const Readline = require('@serialport/parser-readline');



        let serialPortConfig = { path: this.config.device, baudRate: this.config.baudRate, parity: this.config.parity, stopBits: this.config.stopBits, dataBits: this.config.dataBits, flowControl: this.config.flowControl };
        this.log(serialPortConfig);
        this.port = new sp.SerialPort(serialPortConfig);

        this.port.on('error', err => {
            this.err(`[serial.] ERROR: ${err}`);
        });

        this.parser = this.port.pipe(new sp.DelimiterParser({ delimiter: config.delimiter }));

        this.commandsBuffer = [];
        setInterval(() => {
            this.checkCommandsBuffer();
        }, this.timeBetweenCommands);

    }
    disp(text) {
        console.log(text);
    }
    
    log(text) {
        if (this.debug) {
            console.log(text);
        }
    }
    err(text) {
        console.error(text);
    }
    warn(text) {
        if (this.debug) {
            console.warn(text);
        }
    }
    checkCommandsBuffer() {
        try {
            if (this.commandsBuffer.length > 0) {
                var currentCommand = this.commandsBuffer.shift();
                this.write(currentCommand);
            }
        }
        catch (err) {
            this.err(`[serial.checkCommandsBuffer] ERROR: ${err}`);
        }
    }
    write(command) {
        if (this.debug) console.log(`${this.config.name} WRITE > ${command}`);
        this.port.write(command);
    }
    read(callback) {
        setInterval(() => {
            callback('ka 01 01 OK\r');
        },5000);
        this.parser.on('data', data => {
            try {
                this.log(`[serial.read] ${this.config.name} READ > ${data}`);
                callback(data);
            }
            catch (err) {
                this.err(`[serial.read] ERROR: ${err}`);
            }
        });
    }
    feedback(f) {
        this.parser.on('data', data => {
            try {
                if (this.config.driver) {
                    for (const feedback of this.config.driver.feedbacks) {
                        if (data.substring(0, feedback.Header.length) == feedback.Header) {
                            f({ f: feedback.Name, d: data.substring(feedback.Header.length) });
                        }
                    }
                }
            }
            catch (err) {
                this.err(`[serial.feedback] ERROR: ${err}`);
            }
        });
    }
    command(cmd, args) {
        for (const driverCommand of this.config.driver.commands) {
            if (driverCommand.Name == cmd) {
                try {
                    if (args) {
                        for (const arg of Object.keys(args)) {
                            //console.log(`${arg} = ${args[arg]}`);
                            driverCommand.Value = driverCommand.Value.replaceAll('${' + arg + '}', args[arg]);
                        }
                    }
                    this.commandsBuffer.push(driverCommand.Value + this.config.delimiter);
                }
                catch (err) {
                    this.err(`[serial.command] ERROR: ${err}`);
                }
            }
        }
    }
}

module.exports.SerialPort = SerialPort;
