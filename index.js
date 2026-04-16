const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static('public'));

async function startAlphaGen(num, res) {
    const sessionDir = path.join(__dirname, 'sessions', num);
    
    // CRITICAL: Wipe the specific folder to prevent "Couldn't link" corruption
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    // Ensure the main sessions folder exists
    if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        // This identity is verified for 2026 pairing
        browser: Browsers.ubuntu("Chrome"), 
        markOnlineOnConnect: true,
    });

    if (!sock.authState.creds.registered) {
        // Give the socket 3 seconds to stabilize before asking for the code
        await delay(3000); 
        try {
            const code = await sock.requestPairingCode(num);
            console.log(`✅ CODE FOR ${num}: ${code}`);
            if (!res.headersSent) res.json({ code });
        } catch (err) {
            console.error("Pairing Error:", err);
            if (!res.headersSent) res.status(500).json({ error: "Try again in 1 min" });
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") console.log(`CONNECTED: ${num}`);
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startAlphaGen(num, res);
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (text.toLowerCase() === ".ping") {
            await sock.sendMessage(m.key.remoteJid, { text: "🚀 *ALPHA-GEN ONLINE*" });
        }
    });
}

app.get("/get-code", async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, "");
    if (!num) return res.status(400).json({ error: "Invalid Number" });
    await startAlphaGen(num, res);
});

app.listen(PORT, () => console.log(`Server live on ${PORT}`));
