'use strict';

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

http.listen(PORT, () => console.log(`Listening on ${PORT}`));


io.on('connection', (socket) => {
    // console.log('a player connected');
    addPlayer(socket);

    socket.on('join-group', (options, sendState) => {
        let group = joinGroup(socket);
        sendState(group.state);

        let player = getPlayer(socket);
        socket.broadcast.emit('player joined', player.name);
    });

    socket.on('create-group', (state, sendConfirmation) => {
        let group = createGroup(socket);
        group.state = state;

        sendConfirmation();
    });

    socket.on('state-change sent', (state) => {
        let group = getPlayerGroup(socket);
        group.state = state;
        socket.broadcast.emit('state-change', state);
    });

    socket.on('game-move sent', (move) => {
        socket.broadcast.emit('game-move', move);
    });

    socket.on('chat sent', (data) => {
        socket.broadcast.emit('chat', data);
    });
});

/*
 * Consider moving stuff below to new file
 */

let players = new Map; // Map socket ID to Player
let groups = new Map; // Map group ID to Group

function assert(condition, message)
{
    if(!condition) {
        throw Error("Assertion failed: " + message);
    }
}

class Player {
    construtor() {
        this.group = null;
        this.name = null;
    }

    joinGroup(group)
    {
        this.group = group;
        this.name = "Player " + (group.members.length + 1);
    }
}

function unusedGroupId()
{
    const retry_limit = 10; // arbitrary
    for(let i = 0; i < retry_limit; ++i)
    {
        let candidate = Map.round(Math.random() * 100000000);
        if(!groups.has(candidate)) {
            return candidate;
        }
    }
    assert(false, "Failed to get used group ID");
}

class Group {
    constructor() {
        this.groupId = unusedGroupId();
        groups.set(this, this.groupId);

        this.members = new Set; // Socket ID of members
        this.state = null;
    }

    is_member(socket) {
        return this.members.has(socket);
    }

    add_member(socket) {
        if (this.is_member(socket)) {
            throw Error`{socket_id} is aleady a group member`;
        }
    }

    remove_member(socket) {
        if (!this.is_member(socket)) {
            throw Error`{socket_id} is not a group member`;
        }

        members.delete(socket);
    }
}

function addPlayer(socket) {
    if (players.has(socket)) {
        throw Error("Attempt to re-add existing player");
    }
    players.set(socket, new Player);
}

function getPlayer(socket) {
    let usr = players.get(socket);
    if (!usr) {
        throw Error("Unknown player");
    }
    return usr;
}

function createGroup(socket) {
    let player = players.get(socket);
    player.joinGroup(new Group);
}

function joinGroup(socket, group_id) {
    let usr = getPlayer(socket);
    let grp = getGroup(group_id);
    usr.joinGroup(grp);
}

// By default, and error is thrown if the group does not exist
function getPlayerGroup(socket, allow_null_group)
{
    let usr = getPlayer(socket);
    return player.group();
}

