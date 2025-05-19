const Database = require('better-sqlite3');
const db = new Database('data.db');

// Create tables if they don't exist
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  elo INTEGER DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (friend_id) REFERENCES users(id)
);
`);

// Create new user (for signup)
function createUser(username, password) {
    const stmt = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)");
    try {
        const result = stmt.run(username, password);
        return { success: true, userId: result.lastInsertRowid };
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return { success: false, message: "Username already exists." };
        }
        throw err;
    }
}

// Validate login credentials
function validateLogin(username, password) {
    const stmt = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?");
    const user = stmt.get(username, password);
    if (user) {
        return { success: true, user };
    } else {
        return { success: false, message: "Invalid credentials." };
    }
}

// Get user ID by username
function getUserId(username) {
    const stmt = db.prepare("SELECT id FROM users WHERE username = ?");
    const row = stmt.get(username);
    return row ? row.id : null;
}

// Get username by ID
function getUsernameById(id) {
    const stmt = db.prepare("SELECT username FROM users WHERE id = ?");
    const row = stmt.get(id);
    return row ? row.username : null;
}

// Add mutual friendship between two users
function addFriend(username1, username2) {
    const id1 = getUserId(username1);
    const id2 = getUserId(username2);
    if (!id1 || !id2 || id1 === id2) return;

    const stmt = db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)");
    stmt.run(id1, id2);
    stmt.run(id2, id1);
}

// Get all friends for a given user
function getFriends(username) {
    const userId = getUserId(username);
    if (!userId) return [];

    const stmt = db.prepare(`
    SELECT u.username FROM friends f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ?
  `);
    const rows = stmt.all(userId);
    return rows.map(row => row.username);
}

// Export functions
module.exports = {
    db,
    createUser,
    validateLogin,
    getUserId,
    getUsernameById,
    addFriend,
    getFriends
};
