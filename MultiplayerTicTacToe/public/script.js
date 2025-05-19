const socket = io();
let nickname = '';
let room = null;
let myTurn = false;
let mySymbol = '';
let board = Array(9).fill(null);
let isLoggedIn = false;


const boardDiv = document.getElementById('board');
const statusDiv = document.getElementById('status');
function createRoom() {
    socket.emit('create_room');
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (message && nickname) {
        socket.emit('chat', { sender: nickname, message });
        input.value = '';
    }
}

document.getElementById('chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        sendChat();
    }
});


function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.trim();
    if (roomCode) {
        socket.emit('join_room', { roomCode });
    }
}

function render() {
    boardDiv.innerHTML = '';
    board.forEach((cell, i) => {
        const div = document.createElement('div');
        div.textContent = cell || '';
        div.className = 'cell';
        div.onclick = () => {
            if (!cell && myTurn && !checkWinner()) {
                board[i] = mySymbol;
                myTurn = false;
                socket.emit('move', { room, board });
                render();
                checkGameStatus();
            }
        };
        boardDiv.appendChild(div);
    });
    updateStatus();
}
function setNickname() {
    nickname = document.getElementById('nicknameInput').value.trim();
    if (nickname) {
        socket.emit('set_nickname', { nickname });
        document.getElementById('chatInput').disabled = false;
        document.getElementById('chatButton').disabled = false;
    }
}


function checkWinner() {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    for (let [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function checkGameStatus() {
    const winner = checkWinner();
    if (winner) {
        statusDiv.textContent = `${winner} wins!`;
        myTurn = false;
    } else if (!board.includes(null)) {
        statusDiv.textContent = `Draw!`;
        myTurn = false;
    }
}

function updateStatus() {
    if (checkWinner()) return;
    if (!board.includes(null)) return;
    statusDiv.textContent = myTurn ? `Your turn (${mySymbol})` : `Opponent's turn`;
}

// ?? Restart logic
function restartGame() {
    if (!room) return;

    const confirmed = confirm("Restart the game?");
    if (!confirmed) return;

    board = Array(9).fill(null);
    if (mySymbol === 'X') myTurn = true;
    else myTurn = false;

    socket.emit('restart', { room });
    render();
}

socket.on('start', ({ room: r, players }) => {
    room = r;
    mySymbol = players[0].id === socket.id ? 'X' : 'O';
    myTurn = mySymbol === 'X';
    board = Array(9).fill(null);
    render();

    const playerNames = `${players[0].name} (X) vs ${players[1].name} (O)`;
    document.getElementById('players').textContent = playerNames;
    alert(`Game started! You are ${mySymbol}`);
});

socket.on('update', (updatedBoard) => {
    board = updatedBoard;
    myTurn = true;
    render();
    checkGameStatus();
});

// ?? Receive restart event from opponent
socket.on('restart', () => {
    board = Array(9).fill(null);
    myTurn = mySymbol === 'X'; // X always starts
    render();
});

socket.on('room_created', ({ roomCode }) => {
    alert('Room created! Share this code: ' + roomCode);
});

socket.on('join_error', ({ message }) => {
    alert('Join failed: ' + message);
});

socket.on('chat', ({ sender, message }) => {
    const list = document.getElementById('chatMessages');
    const item = document.createElement('li');
    item.textContent = `${sender}: ${message}`;
    list.appendChild(item);
});

function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) return alert("Fill all fields");

    socket.emit('login', { username, password });
}
function logout() {
    nickname = '';
    isLoggedIn = false;

    document.getElementById('auth').style.display = 'block';
    document.getElementById('players').style.display = 'none';
    document.getElementById('logoutButton').style.display = 'none';

    document.getElementById('chatInput').disabled = true;
    document.getElementById('chatButton').disabled = true;

    alert("You have been logged out.");
}

function signup() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) return alert("Fill all fields");

    socket.emit('signup', { username, password });
}

// Handle login/signup response
socket.on('auth_success', ({ username }) => {
    nickname = username;
    isLoggedIn = true;

    document.getElementById('auth').style.display = 'none';
    document.getElementById('players').style.display = 'block';
    document.getElementById('logoutButton').style.display = 'block';

    document.getElementById('chatInput').disabled = false;
    document.getElementById('chatButton').disabled = false;

    alert(`Logged in as ${username}`);
});


socket.on('auth_error', ({ message }) => {
    alert('Auth error: ' + message);
});

function sendFriendRequest() {
    const target = document.getElementById('friendInput').value.trim();
    if (!target || !nickname || !isLoggedIn) return;
    socket.emit('friend_request', { from: nickname, to: target });
}

socket.on('friend_request_received', ({ from }) => {
    const requestList = document.getElementById('requestList');
    const li = document.createElement('li');
    li.innerHTML = `${from} <button onclick="respondFriend('${from}', true)">Accept</button> <button onclick="respondFriend('${from}', false)">Reject</button>`;
    requestList.appendChild(li);
});

function respondFriend(from, accept) {
    socket.emit('friend_response', { from, to: nickname, accept });
}
socket.on('friend_status_update', ({ friend, isOnline }) => {
    const statusSpan = document.getElementById(`status-${friend}`);
    if (statusSpan) {
        statusSpan.textContent = isOnline ? "(online)" : "(offline)";
        statusSpan.style.color = isOnline ? "limegreen" : "red";
    }
});



socket.on('friend_list_update', ({ friends }) => {
    const list = document.getElementById('friendList');
    list.innerHTML = '';
    friends.forEach(f => {
        const li = document.createElement('li');
        li.id = `friend-${f}`;
        li.innerHTML = `
  ${f} 
  <span class="friend-status" id="status-${f}" style="color: gray;">(unknown)</span>
  <button onclick="removeFriend('${f}')">Remove</button>
`;

        list.appendChild(li);
    });
});

function removeFriend(friend) {
    socket.emit('remove_friend', { username: nickname, target: friend });
}
