const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Helper to clean session if it fails
function clearSession(num) {
    const sessionPath = `./sessions/${num}`;
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }
}

async function startAlphaGen(num, res) {
    // 1. Clean start for every new pairing attempt
    clearSession(num);

    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${num}`);
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        // This browser string is key to avoiding "Couldn't Link" errors
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // Handle Pairing Code Request
    if (!sock.authState.creds.registered) {
        await delay(3000); // Wait for socket to stabilize
        try {
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code });
            }
        } catch (err) {
            console.error("Pairing failed:", err);
            if (!res.headersSent) res.status(500).json({ error: "Pairing failed" });
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("Connection closed. Reconnecting:", shouldReconnect);
            if (shouldReconnect) startAlphaGen(num, res);
        } else if (connection === "open") {
            console.log("ALPHA-GEN is now ONLINE ✅");
        }
    });

    // Commands Logic
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const from = m.key.remoteJid;

        if (msgText.toLowerCase() === ".ping") {
            await sock.sendMessage(from, { 
                text: "🚀 *ALPHA-GEN V1 TEST*\n\n*Status:* Online\n*Latancy:* Stable\n*Owner:* lebrondob" 
            });
        }
    });
}

// API Route
app.get("/get-code", async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, "");
    if (!num) return res.status(400).json({ error: "Invalid Number" });
    
    console.log(`Generating code for: ${num}`);
    await startAlphaGen(num, res);
});

app.listen(PORT, () => {
    console.log(`
    =========================================
    ALPHA-GEN SERVER STARTING...
    URL: http://localhost:${PORT}
    =========================================
    `);
});
