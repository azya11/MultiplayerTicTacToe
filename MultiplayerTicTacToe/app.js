'use strict';
let friends = {};   // username -> [friend1, friend2, ...]
let friendRequests = {}; // username -> [pending requests]
let userDB = {};  // username -> password
let onlineUsers = new Set(); // username strings


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
    function findSocketByUsername(username) {
        const id = Object.keys(nicknames).find(key => nicknames[key] === username);
        return id ? io.sockets.sockets.get(id) : null;
    }

    socket.on('remove_friend', ({ username, target }) => {
        friends[username] = (friends[username] || []).filter(f => f !== target);
        friends[target] = (friends[target] || []).filter(f => f !== username);
        const userSocket = findSocketByUsername(username);
        const targetSocket = findSocketByUsername(target);
        if (userSocket) {
            userSocket.emit('friend_list_update', { friends: friends[username] });
        }
        if (targetSocket) {
            targetSocket.emit('friend_list_update', { friends: friends[target] });
        }
    });

    function updateFriendStatuses(user) {
        const userFriends = friends[user] || [];
        userFriends.forEach(friend => {
            const socket = findSocketByUsername(friend);
            if (socket) {
                socket.emit('friend_status_update', {
                    friend: user,
                    isOnline: onlineUsers.has(user)
                });
            }
        });
    }


    socket.on('friend_response', ({ from, to, accept }) => {
        friendRequests[to] = (friendRequests[to] || []).filter(r => r !== from);
        if (accept) {
            friends[from] = friends[from] || [];
            friends[to] = friends[to] || [];
            if (!friends[from].includes(to)) friends[from].push(to);
            if (!friends[to].includes(from)) friends[to].push(from);
        }
        const userSocket = findSocketByUsername(to);
        const friendSocket = findSocketByUsername(from);
        if (userSocket) {
            userSocket.emit('friend_list_update', { friends: friends[to] });
        }
        if (friendSocket) {
            friendSocket.emit('friend_list_update', { friends: friends[from] });
        }
    });

    socket.on('friend_request', ({ from, to }) => {
        if (!userDB[to]) return;
        friendRequests[to] = friendRequests[to] || [];
        if (!friendRequests[to].includes(from)) {
            friendRequests[to].push(from);
            const targetSocket = findSocketByUsername(to);
            if (targetSocket) {
                targetSocket.emit('friend_request_received', { from });
            }
        }
    });

    console.log(`Client connected: ${socket.id}`);

    socket.on('signup', ({ username, password }) => {
        if (userDB[username]) {
            socket.emit('auth_error', { message: 'Username already exists' });
        } else {
            userDB[username] = password;
            nicknames[socket.id] = username;
            socket.emit('auth_success', { username });
        }
    });
    socket.on('login', ({ username, password }) => {
        if (!userDB[username]) {
            socket.emit('auth_error', { message: 'User not found' });
        } else if (userDB[username] !== password) {
            socket.emit('auth_error', { message: 'Wrong password' });
        } else {
            nicknames[socket.id] = username;
            onlineUsers.add(username);
            socket.emit('auth_success', { username });
            updateFriendStatuses(username);
        }
    });



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
        const username = nicknames[socket.id];
        if (username) {
            onlineUsers.delete(username);
            updateFriendStatuses(username);
        }
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
