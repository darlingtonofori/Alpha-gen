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

app.use(express.static('public'));

async function startAlphaGen(num, res) {
    const sessionDir = `./sessions/${num}`;
    // Completely wipe old failed attempts to prevent state corruption
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion(); //

    const sock = makeWASocket({
        version, //
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        // Matches the Knight Bot signature exactly
        browser: ['Chrome', 'Windows', '10.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false
    });

    if (!sock.authState.creds.registered) {
        // Stabilization delay to allow Render to finish the socket handshake
        await delay(5000); 
        try {
            const code = await sock.requestPairingCode(num);
            console.log(`✅ LINK REQUEST SENT: ${code}`);
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
        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (text.toLowerCase() === ".ping") {
            await sock.sendMessage(m.key.remoteJid, { text: "🚀 *ALPHA-GEN* is active!" });
        }
    });
}

app.get("/get-code", async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, "");
    await startAlphaGen(num, res);
});

app.listen(PORT, () => console.log(`Live on ${PORT}`));
