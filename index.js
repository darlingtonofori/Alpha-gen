const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static('public'));

// CLEANUP: Same logic as Knight Bot to prevent "Poisoned" sessions
function clearSession(num) {
    const dir = `./sessions/${num}`;
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

async function startAlphaGen(num, res) {
    clearSession(num);
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${num}`);
    
    // 1. Fetch latest WA version
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        // 2. Exact Browser Identity from Knight Bot
        browser: ['Chrome', 'Windows', '10.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false
    });

    if (!sock.authState.creds.registered) {
        // 3. Stabilization Delay
        await delay(6000); 
        try {
            const code = await sock.requestPairingCode(num);
            console.log(`✅ CODE GENERATED: ${code}`);
            if (!res.headersSent) res.json({ code });
        } catch (err) {
            console.error("Pairing Error:", err);
            if (!res.headersSent) res.status(500).json({ error: "Retry" });
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "open") console.log("ALPHA-GEN ONLINE ✅");
    });

    // Simple .ping command
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (text.toLowerCase() === ".ping") {
            await sock.sendMessage(m.key.remoteJid, { text: "🚀 *ALPHA-GEN* is active!" });
        }
    });
}

app.get("/get-code", async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, "");
    if (!num) return res.status(400).send("No Number");
    await startAlphaGen(num, res);
});

app.listen(PORT, () => console.log(`Live on ${PORT}`));
