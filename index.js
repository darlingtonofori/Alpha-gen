const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

// 1. KNIGHT BOT SECRET: Filter out the "Noise" logs that cause lag on Render
const originalLog = console.log;
const forbiddenPatterns = ['prekey', 'ratchet', 'chainkey', 'sessionentry', 'closing session'];

console.log = (...args) => {
    const msg = args.join(' ').toLowerCase();
    if (!forbiddenPatterns.some(p => msg.includes(p))) originalLog.apply(console, args);
};

app.use(express.static('public'));

async function startAlphaGen(num, res) {
    const sessionDir = `./sessions/${num}`;
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    // 2. Fetch latest WA version (Crucial for 2026 pairing)
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        // 3. EXACT IDENTITY: This triggers the Push Notification
        browser: ['Chrome', 'Windows', '10.0'],
        syncFullHistory: false
    });

    if (!sock.authState.creds.registered) {
        // Stabilization delay
        await delay(5000); 
        try {
            const code = await sock.requestPairingCode(num);
            console.log(`✅ PUSH NOTIFICATION SENT. CODE: ${code}`);
            if (!res.headersSent) res.json({ code });
        } catch (err) {
            console.error("Pairing Error:", err);
            if (!res.headersSent) res.status(500).json({ error: "Retry" });
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        if (m.message.conversation?.toLowerCase() === ".ping") {
            await sock.sendMessage(m.key.remoteJid, { text: "🚀 *ALPHA-GEN* Online" });
        }
    });
}

app.get("/get-code", async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, "");
    await startAlphaGen(num, res);
});

app.listen(PORT, () => console.log(`Server live on ${PORT}`));
