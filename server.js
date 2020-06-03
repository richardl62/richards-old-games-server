'use strict';

var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const PORT = process.env.PORT || 5000;


app.use(express.static('public'));

app.get('/', function (req, res) {
    res.send('Hello World!');
});

http.listen(PORT, () => console.log(`Listening on ${PORT}`));

io.on('connection', (socket) => {
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

        let player = getPlayer(socket);
        player.broadcastToGroup('player joined', player.name);

        resolve(group.state);
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
        player.broadcastToGroup('state-change', state);
    });

    socket.on('game-move sent', (move) => {
        let player = getPlayer(socket);
        player.broadcastToGroup('game-move', move);
    });

    socket.on('chat sent', (data) => {
        let player = getPlayer(socket);
        player.broadcastToGroup('chat', data);
    });
});

/*
 * Consider moving stuff below to new file
 */

function serverError(message)
{
    return {server_error: message};
}

let players = new Map; // Map socket ID to Player
let groups = new Map; // Map group ID to Group

function assert(condition, message)
{
    if(!condition) {
        throw Error("Assertion failed: " + message);
    }
}

class Player {
    constructor(socket) {
        assert(socket);
    
        this.group = null;
        this.name = null;
        this.socket = socket;
    }

    joinGroup(group)
    {
        this.group = group;
        this.name = "Player " + (group.members.length + 1);
    
        this.socket.join(this.group.room());
    }

    broadcastToGroup(...args) {
        console.log("broadcast arguments:", ...args);

        const room = this.group.room();
        let emit = this.socket.broadcast.to(room).emit(...args);
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

    mergeState(state)
    {
        if(state) {
            Object.assign(this.state, state); 
        }
    }

    room() {
        return 'room' + this.groupId;
    }
}

function addPlayer(socket) {
    if (players.has(socket)) {
        throw Error("Attempt to re-add existing player");
    }

    let p = new Player(socket);
    assert(p.socket);
    players.set(socket, p);
}

function getPlayer(socket) {
    let player = players.get(socket);
    assert(player);
    assert(player.socket);
    return player;
}

function getGroup(group_id) {
    return groups.get(group_id);
}



