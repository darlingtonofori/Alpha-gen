const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure db directory exists
const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'alphagen.db'));

// ─── Schema ─────────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE NOT NULL,
        telegram_username TEXT,
        phone TEXT,
        name TEXT,
        status TEXT DEFAULT 'unpaired',
        paired_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        is_banned INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
        telegram_id TEXT PRIMARY KEY,
        autoreact INTEGER DEFAULT 0,
        statusview INTEGER DEFAULT 0
    );
`);

// ─── User Operations ────────────────────────────────────────────
function getUser(telegramId) {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId));
}

function createUser(telegramId, username) {
    db.prepare(`
        INSERT OR IGNORE INTO users (telegram_id, telegram_username)
        VALUES (?, ?)
    `).run(String(telegramId), username || '');
    return getUser(telegramId);
}

function setName(telegramId, name) {
    db.prepare('UPDATE users SET name = ? WHERE telegram_id = ?').run(name, String(telegramId));
}

function setPhone(telegramId, phone) {
    db.prepare('UPDATE users SET phone = ? WHERE telegram_id = ?').run(phone, String(telegramId));
}

function setStatus(telegramId, status) {
    db.prepare('UPDATE users SET status = ? WHERE telegram_id = ?').run(status, String(telegramId));
}

function setPaired(telegramId, phone) {
    db.prepare(`
        UPDATE users SET status = 'connected', phone = ?, paired_at = datetime('now')
        WHERE telegram_id = ?
    `).run(phone, String(telegramId));
}

function setDisconnected(telegramId) {
    db.prepare(`UPDATE users SET status = 'disconnected' WHERE telegram_id = ?`).run(String(telegramId));
}

function banUser(telegramId) {
    db.prepare('UPDATE users SET is_banned = 1 WHERE telegram_id = ?').run(String(telegramId));
}

function unbanUser(telegramId) {
    db.prepare('UPDATE users SET is_banned = 0 WHERE telegram_id = ?').run(String(telegramId));
}

function getAllUsers() {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

function getStats() {
    const total = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const connected = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'connected'").get().c;
    const banned = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_banned = 1').get().c;
    return { total, connected, banned };
}

// ─── Settings Operations ─────────────────────────────────────────
function getSettings(telegramId) {
    const tid = String(telegramId);
    db.prepare('INSERT OR IGNORE INTO settings (telegram_id) VALUES (?)').run(tid);
    return db.prepare('SELECT * FROM settings WHERE telegram_id = ?').get(tid);
}

function toggleSetting(telegramId, key) {
    const tid = String(telegramId);
    db.prepare('INSERT OR IGNORE INTO settings (telegram_id) VALUES (?)').run(tid);
    const current = db.prepare(`SELECT ${key} FROM settings WHERE telegram_id = ?`).get(tid);
    const newVal = current[key] ? 0 : 1;
    db.prepare(`UPDATE settings SET ${key} = ? WHERE telegram_id = ?`).run(newVal, tid);
    return newVal === 1;
}

module.exports = {
    getUser, createUser, setName, setPhone, setStatus,
    setPaired, setDisconnected, banUser, unbanUser,
    getAllUsers, getStats, getSettings, toggleSetting
};
