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

        assert(typeof group_id == "number");
        
        let group = getGroup(group_id);
        if(!group) {
            resolve(socket.id, serverError("Group ID " + group_id + " not recognised"));
            return;
        }

        let player = getPlayer(socket);
        player.joinGroup(group);

        player.broadcastToGroup('player joined');

        resolve({player_id: player, state: group.state});
    });

    socket.on('create-group', (game_state, resolve) => {
        let group = new Group();
        let player = getPlayer(socket);

        player.joinGroup(group);
        group.mergeState(game_state)

        console.log(`player ${player.id} joined new group ${group.id()}`)
        resolve({player_id: player.id, group: group.id()});
    });

    socket.on('state-change', (state) => {
        let player = getPlayer(socket);
        assert(player);
        assert(player.group);
        player.group.mergeState(state);
        player.broadcastToGroup('state-change',state);
    });

    socket.on('game-move', (move) => {
        let player = getPlayer(socket);
        player.broadcastToGroup('game-move', move);
    });

    // socket.on('disconnect', () => {
    //     let player = getPlayer(socket);
    //     player.broadcastToGroup('left group');
    //     removePlayer(player);
    // });
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

var next_player_id = 1;
function get_player_id() {
    ++next_player_id;

    if (next_player_id == Number.MAX_SAFE_INTEGER) { // Almost certainly unnecessary
        console.log("next_player_id reached MAX_SAFE_INTEGER!!!");
        next_player_id = 1;
    }

    return next_player_id;
}

class Player {
    constructor(socket) {
        assert(socket);

        this.group = null;
        this.name = null;
        this.socket = socket;

        this.id = get_player_id();
    }

    joinGroup(group)
    {
        this.group = group;
        this.name = "Player " + (group.members.length + 1);
    
        this.socket.join(this.group.room());
    }

    broadcastToGroup(...args) {
        const room = this.group.room();
        this.socket.broadcast.to(room).emit(this.id, ...args);
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
        this.m_id = unusedGroupId();
        groups.set(this.m_id, this);

        this.members = new Set; // Socket ID of members
        this.state = {};
    }

    mergeState(state)
    {
        if(state) {
            Object.assign(this.state, state); 
        }
    }

    id() {
        return this.m_id;
    }
    room() {
        return 'room' + this.id();
    }

    // Return array of players in this group (ineffient)
    players() {
        players.values().filter(p => p.id() == this.id());
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

function removePlayer(pp) {
    assert(p.socket);

    if (players.has(p.socket)) {
        throw Error("Attempt to remove unregistered player");
    }

    players.remove(socket);

    // Check if the group is still in use (inefficient)
    let n_left = player.group.players().length;

    console.log(n_left + " players left in group "
        + players.group.id());

    if (n_left == 0) {
        players.remove(player.group.id());
    }
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



