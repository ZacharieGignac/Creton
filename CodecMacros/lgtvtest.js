import xapi from 'xapi';


/* Create an LgTv object model, so you can have multiple */
function LgTv(port) {
  const creton = require('./cretonclient');
  var tv = new creton.SerialPort(port);
  return {
    on: () => {
      tv.sendRaw('ka 01 01\r');
    },
    off: () => {
      tv.sendRaw('ka 01 00\r');
    },
    read: (callback) => {
      tv.read(data => { callback(data)});
    }
  }
}

/* Create my 2 TVs. Those are the names in the config.js on your raspberry pi */
var tv1 = LgTv('tv1');
var tv2 = LgTv('tv2');


/* Reading data from TV1 serial port. You should not do this if you don't need to. */
tv1.read(data => {
  console.log(`Received data for TV1: ${data}`);
});

/* Power ON the 2 TVs */
tv1.on();
tv2.on();

/* Power OFF the 2 TVs */
tv1.off();
tv2.off();
