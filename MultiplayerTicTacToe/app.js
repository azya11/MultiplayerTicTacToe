'use strict';

const debug = require('debug')('my express app');
const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const routes = require('./routes/index');
const users = require('./routes/users');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

// Error handling
app.use((req, res, next) => {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

if (app.get('env') === 'development') {
    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err,
        });
    });
} else {
    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: {},
        });
    });
}

// === WebSocket Setup ===
const http = require('http');
const { Server } = require('socket.io');

app.set('port', process.env.PORT || 3000);
const server = http.createServer(app);
const io = new Server(server);

// === Game State ===
let nicknames = {};         // socket.id -> nickname
let rooms = {};             // roomCode -> [player1, player2]

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Set nickname
    socket.on('set_nickname', ({ nickname }) => {
        if (nickname && typeof nickname === 'string') {
            nicknames[socket.id] = nickname;
            socket.emit('nickname_ack', { success: true });
        }
    });

    // Create a room
    socket.on('create_room', () => {
        const roomCode = Math.random().toString(36).substring(2, 8);
        rooms[roomCode] = [socket];
        socket.join(roomCode);
        socket.emit('room_created', { roomCode });
    });

    // Join an existing room
    socket.on('join_room', ({ roomCode }) => {
        if (rooms[roomCode] && rooms[roomCode].length === 1) {
            const player1 = rooms[roomCode][0];
            const player2 = socket;

            rooms[roomCode].push(player2);
            socket.join(roomCode);

            io.to(roomCode).emit('start', {
                room: roomCode,
                players: [
                    { id: player1.id, name: nicknames[player1.id] || "Player 1" },
                    { id: player2.id, name: nicknames[player2.id] || "Player 2" }
                ]
            });
        } else {
            socket.emit('join_error', { message: 'Room not found or already full.' });
        }
    });

    // Game move
    socket.on('move', ({ room, board }) => {
        socket.to(room).emit('update', board);
    });

    // Restart game
    socket.on('restart', ({ room }) => {
        io.to(room).emit('restart');
    });

    // Global Chat
    socket.on('chat', ({ sender, message }) => {
        if (nicknames[socket.id] && typeof message === 'string' && message.trim() !== '') {
            io.emit('chat', { sender, message: message.trim() });
        }
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.id}`);
        delete nicknames[socket.id];

        for (const [roomCode, players] of Object.entries(rooms)) {
            rooms[roomCode] = players.filter(p => p.id !== socket.id);
            if (rooms[roomCode].length === 0) {
                delete rooms[roomCode];
            }
        }
    });
});

server.listen(app.get('port'), () => {
    debug('Express server listening on port ' + server.address().port);
});
