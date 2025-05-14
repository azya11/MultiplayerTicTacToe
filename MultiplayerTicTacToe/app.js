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
        res.render('error', { message: err.message, error: err });
    });
} else {
    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.render('error', { message: err.message, error: {} });
    });
}

// === WebSocket Setup ===
const http = require('http');
const { Server } = require('socket.io');

app.set('port', process.env.PORT || 3000);
const server = http.createServer(app);
const io = new Server(server);

// Game logic
let waitingPlayer = null;
let nicknames = {};

io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Accept nickname anytime after connect
    socket.on('set_nickname', ({ nickname }) => {
        nicknames[socket.id] = nickname;
        socket.emit('nickname_ack', { success: true });
    });

    if (waitingPlayer) {
        const room = `${waitingPlayer.id}#${socket.id}`;
        socket.join(room);
        waitingPlayer.join(room);

        const player1 = waitingPlayer;
        const player2 = socket;

        io.to(room).emit('start', {
            room,
            players: [
                { id: player1.id, name: nicknames[player1.id] || "Player 1" },
                { id: player2.id, name: nicknames[player2.id] || "Player 2" }
            ]
        });

        waitingPlayer = null;
    } else {
        waitingPlayer = socket;
    }

    socket.on('move', ({ room, board }) => {
        socket.to(room).emit('update', board);
    });

    socket.on('restart', ({ room }) => {
        io.to(room).emit('restart');
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        delete nicknames[socket.id];
        if (waitingPlayer?.id === socket.id) {
            waitingPlayer = null;
        }
    });
});

server.listen(app.get('port'), () => {
    debug('Express server listening on port ' + server.address().port);
});
