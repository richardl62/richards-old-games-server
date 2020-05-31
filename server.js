'use strict';

var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const PORT = process.env.PORT || 5000;

function serverError(message)
{
    return {server_error: message};
}

app.use(express.static('public'));

app.get('/', function (req, res) {
    res.send('Hello World!');
});

http.listen(PORT, () => console.log(`Listening on ${PORT}`));


io.on('connection', (socket) => {
    // console.log('a player connected');
    addPlayer(socket);

    socket.on('join-group', (group_id, resolve) => {

        assert(typeof group_id == "number", "Group ID " + group_id + " is not a number");
        
        let group = getGroup(group_id);
        if(!group) {
            resolve(serverError("Group ID " + group_id + " not recognised"));
            return;
        }
        let user = getPlayer(socket);

        user.joinGroup(group);

        resolve(group.state);

        let player = getPlayer(socket);
        socket.broadcast.emit('player joined', player.name);
    });

    socket.on('create-group', (game_state, resolve) => {
        let group = new Group();
        let user = getPlayer(socket);

        user.joinGroup(group);
        group.mergeState(game_state)

        resolve(group.groupId);
    });

    socket.on('state-change sent', (state) => {
        let player = getPlayer(socket);
        player.group.mergeState(state);
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
        // Get 6 Digit random number
        let candidate = Math.round(Math.random() * 1000000);
        if(!groups.has(candidate)) {
            return candidate;
        }
    }
    assert(false, "Failed to get used group ID");
}

class Group {
    constructor() {
        this.groupId = unusedGroupId();
        groups.set(this.groupId, this);

        this.members = new Set; // Socket ID of members
        this.state = {};
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

    mergeState(state)
    {
        if(state) {
            Object.assign(this.state, state); 
            //console.log("group state:", this.state)
        }
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

function getGroup(group_id) {
    return groups.get(group_id);
}

function joinGroup(socket, group_id) {
    let usr = getPlayer(socket);
    let grp = getGroup(group_id);
    assert(grp, "No group found for Group ID:" + group);
    usr.joinGroup(grp);
}


