const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const db = require('./database');

// ─── Socket Map ─────────────────────────────────────────────────
// key: telegramId (string)
// value: { sock, isConnected, phone, isPairing }
const sockets = new Map();

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const EMOJIS = ['❤️','😂','😮','😢','🙏','🔥','👏','💯','😍','🤣','👍','💪','🎉','😎','🤩'];
function randomEmoji() { return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]; }

function getSessionDir(telegramId) {
    const dir = path.join(SESSIONS_DIR, String(telegramId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function clearSession(telegramId) {
    const dir = path.join(SESSIONS_DIR, String(telegramId));
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(f => {
            try { fs.unlinkSync(path.join(dir, f)); } catch(_) {}
        });
    }
}

// ─── Create & Start Socket for a User ───────────────────────────
async function createSocket(telegramId, onConnect, onDisconnect) {
    const tid = String(telegramId);
    const sessionDir = getSessionDir(tid);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            const entry = sockets.get(tid) || {};
            entry.isConnected = true;
            entry.isPairing = false;
            entry.sock = sock;
            sockets.set(tid, entry);

            const jid = sock.user?.id;
            db.setPaired(tid, entry.phone || jid?.split(':')[0] || '');
            console.log(`✅ [${tid}] Connected: ${jid}`);
            if (onConnect) onConnect(sock, jid);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const entry = sockets.get(tid) || {};
            entry.isConnected = false;
            sockets.set(tid, entry);

            console.log(`❌ [${tid}] Disconnected. Code: ${statusCode}`);

            if (statusCode === 401 || statusCode === 403) {
                db.setDisconnected(tid);
                clearSession(tid);
                sockets.delete(tid);
                if (onDisconnect) onDisconnect('logged_out');
                return;
            }

            if (entry.isPairing) return; // don't reconnect mid-pair

            db.setDisconnected(tid);
            if (onDisconnect) onDisconnect('disconnected');

            // Auto reconnect after 5s
            await delay(5000);
            console.log(`🔄 [${tid}] Reconnecting...`);
            createSocket(telegramId, onConnect, onDisconnect);
        }
    });

    // ─── Message Handler ────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message) return;

        const jid = msg.key.remoteJid;
        const isMe = msg.key.fromMe;
        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text || '';

        // Auto react
        const settings = db.getSettings(tid);
        if (settings.autoreact && !isMe && jid !== 'status@broadcast') {
            try {
                await sock.sendMessage(jid, { react: { text: randomEmoji(), key: msg.key } });
            } catch(_) {}
        }

        // Status view
        if (settings.statusview && jid === 'status@broadcast' && !isMe) {
            try {
                await sock.readMessages([msg.key]);
                await sock.sendMessage('status@broadcast', {
                    react: { text: randomEmoji(), key: msg.key }
                });
            } catch(_) {}
        }

        // Commands
        if (!text.startsWith('.')) return;
        const commandName = text.split(' ')[0].slice(1).toLowerCase();
        const file = path.join(__dirname, 'commands', `${commandName}.js`);
        if (fs.existsSync(file)) {
            try {
                delete require.cache[require.resolve(file)];
                await require(file).execute(sock, msg, text, tid);
            } catch(e) {
                console.log(`[${commandName}] Error:`, e.message);
                try { await sock.sendMessage(jid, { text: `❌ Error: ${e.message}` }); } catch(_) {}
            }
        }
    });

    // Store in map
    const existing = sockets.get(tid) || {};
    existing.sock = sock;
    sockets.set(tid, existing);

    return sock;
}

// ─── Pair a User ────────────────────────────────────────────────
async function pairUser(telegramId, phone, onCode, onSuccess, onFail) {
    const tid = String(telegramId);

    // Close existing socket if any
    const existing = sockets.get(tid);
    if (existing?.sock) {
        try { existing.sock.ws?.close(); } catch(_) {}
        await delay(1000);
    }

    clearSession(tid);
    sockets.set(tid, { isPairing: true, phone });

    try {
        const sock = await createSocket(tid, onSuccess, async (reason) => {
            if (reason === 'logged_out') onFail('Session expired. Run /pair again.');
        });

        // Wait for socket to open (60s timeout)
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('WhatsApp took too long to respond. Try again.')), 60000);
            sock.ev.on('connection.update', ({ connection }) => {
                if (connection === 'open') { clearTimeout(timeout); resolve(); }
            });
        });

        await delay(2000);
        const code = await sock.requestPairingCode(phone);
        if (onCode) onCode(code);

    } catch(e) {
        clearSession(tid);
        sockets.delete(tid);
        db.setStatus(tid, 'unpaired');
        if (onFail) onFail(e.message);
    }
}

// ─── Resume All Sessions on Startup ─────────────────────────────
async function resumeAllSessions(onConnect, onDisconnect) {
    const users = db.getAllUsers().filter(u => u.status === 'connected' && !u.is_banned);
    console.log(`📋 Resuming ${users.length} sessions...`);
    for (const user of users) {
        const sessionDir = path.join(SESSIONS_DIR, user.telegram_id);
        if (fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0) {
            await delay(1000);
            createSocket(
                user.telegram_id,
                (sock, jid) => onConnect(user.telegram_id, sock, jid),
                (reason) => onDisconnect(user.telegram_id, reason)
            );
        }
    }
}

function getSocket(telegramId) {
    return sockets.get(String(telegramId));
}

function isConnected(telegramId) {
    return sockets.get(String(telegramId))?.isConnected || false;
}

module.exports = { pairUser, resumeAllSessions, getSocket, isConnected, clearSession };
