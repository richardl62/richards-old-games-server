'use strict';

var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const PORT = process.env.PORT || 5000;

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // Bad for security!!!
    next();
  });

app.use(express.static('public'));

http.listen(PORT, () => console.log(`Listening on ${PORT}`));

io.on('connection', (socket) => {

    socket.on('join-game', (game_id, state, resolve) => {
        let game;
        if (game_id) {
            assert(typeof game_id == "number", "invalid game_id");
            game = getGame(game_id);
        } else {
            game = new Game;
        }

        if (!game) {
            console.log('Could not join game ' + game_id)
            resolve(serverError('Could not join game ' + game_id));
            return;
        }

        game.mergeState(state);


        let player = new Player(socket, game);
        player.broadcastToGame('player joined');

        resolve({
            player_id: player.id(),
            game_id: game.id(),
            game_state: game.state()
        });
    });

    socket.on('disconnect', data => {
        let player = getPlayerUnchecked(socket);
        if (player) {
            player.broadcastToGame('player left');
            deletePlayer(player);
        }
    });

    socket.on('data', (state, info) => {
        let player = getPlayer(socket);
        player.game().mergeState(state);

        player.broadcastToGame('data', {
            state: state,
            info: info,
        });
    });
})

/*
 * Consider moving stuff below to new file
 */


let players = new Map; // Map socket ID to Player
let games = new Map; // Map game ID to Game

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
    constructor(socket, game) {
        assert(socket, "Socket not supplied");
        assert(game instanceof Game, "Invalid game");

        this.m_socket = socket;
        this.m_game = game;
        this.m_socket.join(game.room());

        this.m_id = get_player_id();

        assert(!players.has(socket),
            "Player aleady assigned to socket");
        players.set(socket, this);
    }

    id() {
        return this.m_id;
    }

    game() {
        return this.m_game;
    }

    socket() {
        return this.m_socket;
    }

    broadcastToGame(channel, data) {
        if (data == undefined) {
            data = {};
        }
        assert(typeof data == "object");
        data.player_id = this.id();
        const room = this.game().room();
        this.socket().broadcast.to(room).emit(channel, data);
    }
}

function deletePlayer(player) {
    console.log("Deleting player " + player.id());
    let game = player.game();

    assert(players.has(player.socket()))
    players.delete(player.socket());

    if(game.members().length == 0) {
        console.log("Deleting game ", game.id());
        games.delete(game.id());
    }
}

// Generate 6 digit random ID which is not already in use.
function unusedGameId() {
    // Implementation is a kludge.
    const retry_limit = 10; // arbitrary
    for (let i = 0; i < retry_limit; ++i) {
        let candidate = Math.round(Math.random() * 1000000);
        if (!games.has(candidate)) {
            return candidate;
        }
    }
    assert(false, "Failed to get used game ID");
}

class Game {
    constructor() {
        this.m_id = unusedGameId();
        console.log("Adding game ", this.m_id);
        games.set(this.m_id, this);

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

    // Return array of players in this game (ineffient)
    members() {
        let player_array = new Array(...players.values())
        return player_array.filter(p => p.game() == this);
    }
}

function getPlayerUnchecked(socket) {
    return players.get(socket);
}
function getPlayer(socket) {
    let player = getPlayerUnchecked(socket);
    assert(player, "Player not found");
    assert(player.game(), "Player does not have game");
    assert(player.id(), "Player does not have id");
    return player;
}

function getGame(game_id) {
    return games.get(game_id);
}



