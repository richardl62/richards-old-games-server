var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.use(express.static('public'));

app.get('/test', function (req, res) {

    const file = __dirname + "/public/test.html";
    console.log('file', file);
    res.sendFile(file);
});

app.get('/', function (req, res) {
  res.send('Hello World!');
});

http.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    socket.on('game-move made', (move) => {
        socket.broadcast.emit('game-move', move);
    });
  });