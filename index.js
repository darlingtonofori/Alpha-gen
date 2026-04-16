const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --- BOT LOGIC ---
async function startAlphaGen(num) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${num}`);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered && num) {
        await delay(1500);
        let code = await sock.requestPairingCode(num);
        return code;
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text;

        if (msgText === ".ping") {
            await sock.sendMessage(m.key.remoteJid, { text: "🚀 *ALPHA-GEN Online* \nSpeed: 0.001ms" });
        }
    });
}

// --- API ENDPOINT FOR PAIRING ---
app.get("/get-code", async (req, res) => {
    const number = req.query.number;
    if (!number) return res.status(400).json({ error: "No number provided" });
    try {
        const code = await startAlphaGen(number.replace(/[^0-9]/g, ""));
        res.json({ code });
    } catch (err) {
        res.status(500).json({ error: "Failed to generate code" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
