'use strict';

var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');
const PORT = process.env.PORT || 5000;

function serverError(err) {
    console.log("Error reported: ", err);
    return { server_error: err };
}

function serverException(err) {
    console.log("Exception caught: ", err);
    return { server_error: err.message };
}

function assert(condition, message) {
    if (!condition) {
        let err = Error("Assertion failed: " + message);
        console.log(err);
        throw err;
    }
}

http.listen(PORT, () => console.log(`Listening on ${PORT}`));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // Bad for security!!!
    res.header("Access-Control-Allow-Headers", "*"); // Bad for security!!!

    next();
});

app.use(express.static('public'));


app.post('/open-games', function (req, res) {
    try {
        let data = [];
        for (let [id, game] of games) {
            data.push([id, game.type()]);
        }
        res.json(data);
    } catch (err) {
        res.json(serverException(err.message));
    }
});

// Start a game if  does not already exist.
// Return {
//   id: <game id>
//}
//
app.post('/start-game', function (req, res) {
    let client_data = null;

    try {
        let id = req.body.id;
        const game_type = req.body.game;

        //console.log(`/start-game: id="${id}" game_type="${game_type}"`);

        if (!id) {
            id = pick_unused_id();
            //console.log(`/start-game: id set to "${id}"`);
        }

        assert(typeof id == "string");
        
        let existing_game = getGame(id); // inefficient if id was originally unset
        client_data = {
            id: id,
            previouslyStarted: Boolean(existing_game),
        };

        if (existing_game && existing_game.type() != game_type) {
            client_data = serverException(`Inconsisent game types: "${existing_game.type()}" vs "${game_type}"`);
        }
        
        if(!existing_game) {
            startGame(id, game_type);
        }

    } catch (err) {
        client_data = serverException(err.message);
    }

    console.log("/start-game client data", client_data);
    res.json(client_data);
});

// Kludge: Should not be a get
app.post('/clear', function (req, res) {
    try {
        const id = req.body.id;
        const game = req.body.game;

        clearAll();
        res.json(true);
    } catch (err) {
        res.json(serverException(err.message));
    }
});

function process_socket_exception(socket, err) {
    try {
        let player = getPlayerUnchecked(socket);
        if (player) {
            const game = player.game();
            game.emit('server-error', err.message);
        }
    } catch (err) {
        res.json(serverException(err.message));
    }
}

io.on('connection', (socket) => {
    console.log(`Connecting`);

    // Join game with the given id.
    socket.on('join-game', (args, resolve) => {
        try {
            const game_id = args.id;
            const game_state = args.state;

            console.log(`join-game: requested received - id=${game_id}`);

            if (typeof game_id != "string" || game_id == '') {
                resolve(serverError('Invalid game id' + game_id));
                return;
            }

            if (typeof game_state != "object") {
                resolve(serverError('Invalid state' + game_state));
                return;
            }

            let game = getGame(game_id);
            if (!game) {
                resolve(serverError('Could not join game ' + game_id));
                return;
            }

            let player = new Player(socket, game);
            player.broadcastToGame('player joined');

            let log_message = `player ${player.id()} has joined game ${game.id()}`;
            const game_in_progress = Boolean(game.state());
            if (!game_in_progress) {
                console.log(`join-game: first join - using suppied state`);
                game.state(game_state)
                log_message += " (first join)";
            }

            console.log(log_message);

            const status = {
                player_id: player.id(),
                game_id: game.id(),
                state: game_in_progress ? game.state() : null,
            }

            resolve(status);
        } catch (err) {
            process_socket_exception(this, err);
        }
    });

    socket.on('disconnect', data => {
        try {
            let player = getPlayerUnchecked(socket);
            if (player) {
                player.broadcastToGame('player left');
            }
        } catch (err) {
            process_socket_exception(this, err);
        }
    });

    socket.on('state', data => {
        const state = data.state;

        try {
            let player = getPlayer(socket);
            if (state) {
                player.game().mergeState(state);
            }

            let server_info = {
                player_id: player.id(),
            };
        player.broadcastToGame('state', Object.assign(data, {server_info: server_info}));

        } catch (err) {
            process_socket_exception(this, err);
        }
    });

    // DEPRECATED: Prefer 'state'
    socket.on('data', (state, info) => {
        try {
            let player = getPlayer(socket);
            player.game().mergeState(state);

        player.broadcastToGame('data', {
                state: state,
                info: info,
            });
        } catch (err) {
            process_socket_exception(this, err);
        }
    });
})

/*
 * Consider moving stuff below to new file
 */


let players = new Map; // Map socket ID to Player
let games = new Map; // Map game ID to Game


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

    destroy() {
        const socket = this.m_socket;
        if(socket) {
            console.log("Deleting player " + this.id());

            socket.disconnect();

            assert(players.has(socket));
            players.delete(socket);

            
            this.m_socket = null;
        }
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
    constructor(id, type) {
        assert(id && type);
        this.m_id = id;
        this.m_type = type;
        this.m_state = null;

        games.set(id, this);
    }

    mergeState(state) {
        if (state) {
            Object.assign(this.m_state, state);
        }
    }

    id() {
        return this.m_id;
    }

    type() {
        return this.m_type;
    }

    state(state_) {
        if (state_ === undefined) {
            return this.m_state;
        } else {
            this.m_state = state_;
        }
    }

    room() {
        return 'room' + this.id();
    }

    // Return array of players in this game (ineffient)
    members() {
        let player_array = new Array(...players.values())
        return player_array.filter(p => p.game() == this);
    }

    // Send to all players in room
    emit(channel, data) {
        const room = this.game().room();
        io.to('room1').emit(channel, data);
    }

    // // Discoonect all users
    // disconnect() {
    //     console.log("Disconnecting game", this.id());
    //     const room = this.room();
    //     // Adapted from 
    //     // https://stackoverflow.com/questions/43296140/disconnect-all-users-in-sockect-io-room
    //     io.of('/').in(room).clients((error, clients) => {
    //         if (error) throw error;
    //         for (var i = 0; i < clients.length; i++) {
    //             io.sockets.connected[clients[i]].disconnect(true)
    //         }
    //     });
    // }
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

function gameExists(id) {
    return games.has(id);
}

function pick_unused_id() {
    let id = Math.ceil(Math.random() * 10000)
    for (let i = 0; i < 1000 /* arbitrary */; i++) {
        let s = (id + i).toString();
        if (!games.has(s)) {
            return s;
        }
    }
    throw new Error("Could pick unused game id");
}

function getGame(id) {
    assert(typeof id == "string");
    return games.get(id);
}

function startGame(id, game) {
    console.log("Starting game: id=", id, "game=", game)

    assert(typeof id == "string", "bad ID");
    assert(typeof game == "string", "bad Game type");
    assert(!games.has(id), "game id already defined");

    return new Game(id, game);
}

function clearAll() {
    console.log("Clearing all players and games");
    for(let [id, player] of players) {
        player.destroy();
    }
   
    games.clear(); // kludge
}



