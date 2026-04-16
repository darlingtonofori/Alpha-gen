/**
 * ALPHA-GEN Database (JSON file-based)
 */

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'database');
const USERS_FILE = path.join(DB_DIR, 'users.json');

// Init
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));

const read = () => {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return {}; }
};

const write = (data) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
};

const getUser = (number) => {
  const db = read();
  if (!db[number]) {
    db[number] = { vip: false, vipExpiry: null, banned: false, joinedAt: Date.now() };
    write(db);
  }
  return db[number];
};

const updateUser = (number, data) => {
  const db = read();
  db[number] = { ...db[number], ...data };
  write(db);
};

const isVip = (number) => {
  const user = getUser(number);
  if (!user.vip) return false;
  // Check expiry
  if (user.vipExpiry && Date.now() > user.vipExpiry) {
    updateUser(number, { vip: false, vipExpiry: null });
    return false;
  }
  return true;
};

const getAllVips = () => {
  const db = read();
  return Object.entries(db)
    .filter(([, u]) => u.vip && (!u.vipExpiry || Date.now() < u.vipExpiry))
    .map(([number, u]) => ({ number, expiry: u.vipExpiry }));
};

module.exports = { getUser, updateUser, isVip, getAllVips };
