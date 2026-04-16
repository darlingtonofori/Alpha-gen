const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static('public'));

async function startAlphaGen(num, res) {
    // 1. Force a clean directory for this specific number
    const sessionDir = `./sessions/${num}`;
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            // 2. Cacheable Key Store is MANDATORY for pairing codes
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        // 3. Use the exact identity WhatsApp expects for mobile pairing
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false
    });

    if (!sock.authState.creds.registered) {
        // 4. Give the socket more time to "breathe" before requesting the code
        await delay(5000); 
        try {
            const code = await sock.requestPairingCode(num);
            console.log(`CODE GENERATED: ${code}`);
            if (!res.headersSent) res.json({ code });
        } catch (err) {
            console.error("Pairing Error:", err);
            if (!res.headersSent) res.status(500).json({ error: "Server busy, try again." });
        }
    }

    sock.ev.on("creds.update", saveCreds);

    // This handles the ".ping" after you successfully link
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (text.toLowerCase() === ".ping") {
            await sock.sendMessage(m.key.remoteJid, { text: "🚀 *ALPHA-GEN* Linked Successfully!" });
        }
    });
}

app.get("/get-code", async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, "");
    if (!num) return res.status(400).send("Invalid Num");
    await startAlphaGen(num, res);
});

app.listen(PORT, () => console.log(`Demo live on ${PORT}`));
