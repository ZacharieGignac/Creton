const webexroomssh = require('./webexroomssh');


function init() {
    const auth = {
        username:'zagig',
        password:'Ieidm2f++'
    }
    const codecInfo = {
        ip: '10.1.48.247',
        serialNumber: 'Serial here',
        name:'Test'

    }
    var c = new webexroomssh.Codec(codecInfo, auth, true);

    c.on('connect', () => {
        console.log(`Codec connected`);
        c.on('message',message => {
            console.log('MESSAGE: ' + message.Text);
        });
    });
    c.on('disconnect', (reason) => {
        console.log(`Codec disconnected: ${reason}`);
        console.log(`Reconnecting in 5 seconds`);
        setTimeout(() => {
            c.connect();
        },5000);
    });
    c.on('connecting', () => {
        console.log(`Codec connecting`);
    })

    c.connect();
}

init();

