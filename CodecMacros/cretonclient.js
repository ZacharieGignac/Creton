import xapi from 'xapi';
class SerialPort {
  constructor(device) {

    this._readCallbacks = [];
    this._feedbacks = [];
    this.device = device;

    xapi.Event.Message.Send.on(message => {
      try {
        var jsm = JSON.parse(message.Text);

        switch (jsm.$.t) {
          case 1:
            this.initStart();
            break;
          case 2:
            this.initStop();
            break;
          case 4:
            if (jsm.$.n == this.device) {
              for (const rc of this._readCallbacks) {
                rc.callback(jsm.$.d);
              }
            }
            break;
          case 5:
            break;
          case 7:
            if (jsm.$.n == this.device) {
              for (const fb of this._feedbacks) {
                if (fb.name == jsm.$.f) {
                  fb.callback(jsm.$.d);
                }
              }
            }
            break;
        }
      }
      catch (e) { }
    });
  }
  initStart() {

  }
  initStop() {

  }
  sendRaw(data) {
    var rawCommand = {
      $: {
        t: 5,
        p: this.device,
        d: data
      }
    };
    xapi.Command.Message.Send({ Text: JSON.stringify(rawCommand) });
  }
  read(callback) {
    this._readCallbacks.push({ device:this.device, callback:callback });
  }
  feedback(fbName, fbCallback) {
    this._feedbacks.push({ name:fbName, callback:fbCallback});
  }
  command(cmd, args) {
    var command = {
      $: {
        t: 6,
        p: this.device,
        c: cmd,
        a: args
      }
    };
    xapi.Command.Message.Send({Text: JSON.stringify(command)});
  }
}

module.exports = { SerialPort };
