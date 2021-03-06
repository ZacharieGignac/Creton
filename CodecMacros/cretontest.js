import xapi from 'xapi';

const creton = require('./cretonclient'); //require the lib
var epson = new creton.SerialPort('Projector'); //Create a device listener, name in pi's config file

/* subscribe to the feedback for lamp hours and set the value of a widget */
epson.feedback('LampHourFeedback', hours => {
  xapi.Command.UserInterface.Extensions.Widget.SetValue({
    WidgetId:'txtlamp',
    Value:hours
  });
});

/* poll the lamp hours every 10 sec. */
//setInterval(() => { epson.command('LampHoursPoll'); console.log('CRASH!)'); },10000);

setInterval(() => { epson.sendRaw('PWR ON\r\r') },5000);

/* Display raw serial data. Might contain all stuff like errors and shit */
epson.read(data => {
  console.log(`GOT DATA FROM EPSON: ${data}`);
});


/* Handles the 2 projector power buttons. and send the commands */
function guiEvent(event) {
  if (event.WidgetId == 'projon' && event.Type == 'released') {
    epson.command('PowerOn');
  }
  else if (event.WidgetId == 'projoff' && event.Type == 'released') {
    epson.command('PowerOff');
  }
}
