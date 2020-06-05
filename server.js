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

    socket.on('join-group', (group_id, state, resolve) => {
        let group;
        if (group_id) {
            assert(typeof group_id == "number", "invalid group_id");
            group = getGroup(group_id);
        } else {
            group = new Group;
        }

        if (!group) {
            console.log('Could not join group ' + group_id)
            resolve(serverError('Could not join group ' + group_id));
            return;
        }

        group.mergeState(state);


        let player = new Player(socket, group);
        player.broadcastToGroup('player joined');

        resolve({
            player_id: player.id(),
            group_id: group.id(),
            group_state: group.state()
        });
    });

    socket.on('disconnect', data => {
        let player = getPlayerUnchecked(socket);
        if (player) {
            player.broadcastToGroup('player left');
            deletePlayer(player);
        }
    });

    socket.on('state', data => {
        let player = getPlayer(socket);
        player.group().mergeState(data);

        player.broadcastToGroup('state', {
            state: data,
        });
    });

    socket.on('transcient', data => {
        let player = getPlayer(socket);
        player.broadcastToGroup('transcient', {
            transcient: data,
        });
    });
})

/*
 * Consider moving stuff below to new file
 */


let players = new Map; // Map socket ID to Player
let groups = new Map; // Map group ID to Group

function serverError(message)
{
    return {server_error: message};
}

function assert(condition, message) {
    if (!condition) {
        let err = Error("Assertion failed: " + message);
        console.log(err);
        throw err;
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
    constructor(socket, group) {
        assert(socket, "Socket not supplied");
        assert(group instanceof Group, "Invalid group");

        this.m_socket = socket;
        this.m_group = group;
        this.m_socket.join(group.room());

        this.m_id = get_player_id();

        assert(!players.has(socket),
            "Player aleady assigned to socket");
        players.set(socket, this);
    }

    id() {
        return this.m_id;
    }

    group() {
        return this.m_group;
    }

    socket() {
        return this.m_socket;
    }

    broadcastToGroup(channel, data) {
        if (data == undefined) {
            data = {};
        }
        assert(typeof data == "object");
        data.player_id = this.id();
        const room = this.group().room();
        this.socket().broadcast.to(room).emit(channel, data);
    }
}

function deletePlayer(player) {
    console.log("Deleting player " + player.id());
    let group = player.group();

    assert(players.has(player.socket()))
    players.delete(player.socket());

    if(group.members().length == 0) {
        console.log("Deleting group ", group.id());
        groups.delete(group.id());
    }
}

// Generate 6 digit random ID which is not already in use.
function unusedGroupId() {
    // Implementation is a kludge.
    const retry_limit = 10; // arbitrary
    for (let i = 0; i < retry_limit; ++i) {
        let candidate = Math.round(Math.random() * 1000000);
        if (!groups.has(candidate)) {
            return candidate;
        }
    }
    assert(false, "Failed to get used group ID");
}

class Group {
    constructor() {
        this.m_id = unusedGroupId();
        console.log("Adding group ", this.m_id);
        groups.set(this.m_id, this);

        this.m_state = {};
    }

    mergeState(state) {
        if (state) {
            Object.assign(this.m_state, state);
        }
    }

    id() {
        return this.m_id;
    }

    state() {
        return this.m_state;
    }

    room() {
        return 'room' + this.id();
    }

    // Return array of players in this group (ineffient)
    members() {
        let player_array = new Array(...players.values())
        return player_array.filter(p => p.group() == this);
    }
}

function getPlayerUnchecked(socket) {
    return players.get(socket);
}
function getPlayer(socket) {
    let player = getPlayerUnchecked(socket);
    assert(player, "Player not found");
    assert(player.group(), "Player does not have group");
    assert(player.id(), "Player does not have id");
    return player;
}

function getGroup(group_id) {
    return groups.get(group_id);
}



