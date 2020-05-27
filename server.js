var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const PORT = process.env.PORT || 5000;
app.use(express.static('public'));

app.get('/test', function (req, res) {

    const file = __dirname + "/public/test.html";
    console.log('file', file);
    res.sendFile(file);
});

app.get('/', function (req, res) {
  res.send('Hello World!');
});

http.listen(PORT, () => console.log(`Listening on ${ PORT }`));


io.on('connection', (socket) => {
    // console.log('a user connected');

    socket.on('game-move sent', (move) => {
        socket.broadcast.emit('game-move', move);
    });

    socket.on('state-change sent', (data) => {;
        socket.broadcast.emit('state-change', data);
    });

    socket.on('chat sent', (data) => {;
        socket.broadcast.emit('chat', data);
    });

    socket.on('am i connected', fn => fn()); // TEMPORARY
  });
