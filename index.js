const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const { Telegraf } = require('telegraf');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ─── Load Config ───────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

// ─── Telegram Bot ──────────────────────────────────────────────
const tgBot = new Telegraf(process.env.TG_TOKEN || '8785161883:AAGAXg0C593wVcg2LUTu39VDN9kMq_mBvIk');

// ─── State ─────────────────────────────────────────────────────
let sock = null;
let isConnected = false;
let ownerJid = null;
let pendingNameCtx = null; // holds telegram ctx while waiting for /setname
const startTime = Date.now();

// ─── Auto React State ──────────────────────────────────────────
let autoReactEnabled = false;

// ─── Status View State ─────────────────────────────────────────
let statusViewEnabled = false;

const EMOJIS = ['❤️','😂','😮','😢','🙏','🔥','👏','💯','😍','🤣','👍','💪','🎉','😎','🤩'];

// ─── Helpers ───────────────────────────────────────────────────
function getUptime() {
    const uptime = Date.now() - startTime;
    const s = Math.floor(uptime / 1000) % 60;
    const m = Math.floor(uptime / 60000) % 60;
    const h = Math.floor(uptime / 3600000);
    return `${h}h ${m}m ${s}s`;
}

function randomEmoji() {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function saveConfig() {
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

// ─── Welcome Message ───────────────────────────────────────────
async function sendWelcome(jid) {
    const name = config.ownerName || 'Boss';
    const welcomeText =
        `╔══════════════════════════╗\n` +
        `║   🦍 *ALPHA-GEN v1.0*   ║\n` +
        `║     by *LEBRONDOB*       ║\n` +
        `╚══════════════════════════╝\n\n` +
        `👋 Welcome back, *${name}*!\n\n` +
        `✅ WhatsApp successfully linked.\n` +
        `🤖 Alpha-gen is now *LIVE* and ready.\n\n` +
        `📋 Type *.menu* to see all commands.\n\n` +
        `📢 Stay updated:\n${config.channelLink}`;

    try {
        // Send image + caption if menu image exists
        const imgPath = path.join(__dirname, 'images', 'menu.jpg');
        if (fs.existsSync(imgPath)) {
            const imgBuffer = fs.readFileSync(imgPath);
            await sock.sendMessage(jid, {
                image: imgBuffer,
                caption: welcomeText
            });
        } else {
            await sock.sendMessage(jid, { text: welcomeText });
        }
    } catch (e) {
        console.log('Welcome send error:', e.message);
    }
}

// ─── Main WhatsApp Connection ───────────────────────────────────
async function startAlphaGen() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    // ─── Connection Updates ─────────────────────────────────────
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            isConnected = true;
            ownerJid = sock.user?.id;
            console.log('✅ WhatsApp Connected:', ownerJid);

            // Send welcome to self
            if (ownerJid) {
                await delay(2000);
                await sendWelcome(ownerJid);
            }
        }

        if (connection === 'close') {
            isConnected = false;
            console.log('❌ Disconnected. Reconnecting...');
            await delay(5000);
            startAlphaGen();
        }
    });

    // ─── Message Handler ────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const msg = messages[0];
        if (!msg?.message) return;

        const jid = msg.key.remoteJid;
        const isMe = msg.key.fromMe;
        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text || "";

        // ─── Auto React ─────────────────────────────────────────
        if (autoReactEnabled && !isMe && jid !== 'status@broadcast') {
            try {
                await sock.sendMessage(jid, {
                    react: { text: randomEmoji(), key: msg.key }
                });
            } catch (_) {}
        }

        // ─── Status View & React ─────────────────────────────────
        if (statusViewEnabled && jid === 'status@broadcast' && !isMe) {
            try {
                await sock.readMessages([msg.key]);
                await sock.sendMessage('status@broadcast', {
                    react: { text: randomEmoji(), key: msg.key }
                });
            } catch (_) {}
        }

        // ─── Commands ────────────────────────────────────────────
        if (!text.startsWith('.')) return;

        const commandName = text.split(' ')[0].slice(1).toLowerCase();
        const file = `./commands/${commandName}.js`;

        // Pass autoreact & sttv toggle state via sock context
        sock._autoReact = autoReactEnabled;
        sock._statusView = statusViewEnabled;

        if (fs.existsSync(file)) {
            try {
                // Clear require cache so edits reload live
                delete require.cache[require.resolve(file)];
                const result = await require(file).execute(sock, msg, text);
                // Handle toggle returns
                if (commandName === 'autoreact' && result !== undefined) autoReactEnabled = result;
                if (commandName === 'sttv' && result !== undefined) statusViewEnabled = result;
            } catch (e) {
                console.log(`[${commandName}] Error:`, e.message);
                await sock.sendMessage(jid, { text: `❌ Command error: ${e.message}` });
            }
        }
    });
}

// ─── Telegram Commands ──────────────────────────────────────────

// /start — show menu + enforce channel follow
tgBot.start(async (ctx) => {
    const menu =
        `🦍 *ALPHA-GEN v1.0* by LEBRONDOB\n\n` +
        `📋 *Available Commands:*\n\n` +
        `/pair [number] — Link your WhatsApp\n` +
        `   e.g. /pair 233241234567\n\n` +
        `/setname [name] — Set your display name\n` +
        `   e.g. /setname Dead Man\n\n` +
        `/status — Check bot connection\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *MANDATORY:* You must follow our\n` +
        `WhatsApp channel before pairing:\n\n` +
        `👉 ${config.channelLink}\n\n` +
        `After following, use /pair to continue.`;

    await ctx.replyWithMarkdown(menu);
});

// /setname — save owner name
tgBot.command('setname', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!args) return ctx.reply("❌ Usage: /setname YourName\nExample: /setname Dead Man");
    config.ownerName = args;
    saveConfig();
    ctx.reply(`✅ Name set to: *${args}*\n\nNow use /pair to link WhatsApp.`, { parse_mode: 'Markdown' });
});

// /pair — request pairing code
tgBot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply("❌ Usage: /pair 233XXXXXXXXX");

    const num = args[1].replace(/[^0-9]/g, '');
    if (num.length < 10) return ctx.reply("❌ Invalid number. Include country code.\nExample: /pair 233241234567");

    // Check name is set
    if (!config.ownerName) {
        return ctx.reply(
            "⚠️ You haven't set your name yet!\n\n" +
            "Use /setname first:\n" +
            "Example: /setname Dead Man\n\n" +
            "Then use /pair again."
        );
    }

    // Remind channel follow
    await ctx.reply(
        `⚠️ Make sure you've followed our channel:\n${config.channelLink}\n\n` +
        `⏳ Requesting pairing code for *+${num}*...\n` +
        `Handshaking — 10 second delay...`,
        { parse_mode: 'Markdown' }
    );

    try {
        await delay(10000);
        const code = await sock.requestPairingCode(num);
        ctx.reply(
            `🔑 *PAIRING CODE:*\n\n\`${code}\`\n\n` +
            `📱 Steps:\n` +
            `1. Open WhatsApp → Linked Devices\n` +
            `2. Tap "Link with phone number"\n` +
            `3. Enter code above\n\n` +
            `✅ Welcome message will send automatically!`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        ctx.reply("❌ Pairing failed. Run:\n`rm -rf session`\nthen restart the bot.", { parse_mode: 'Markdown' });
    }
});

// /status — connection status
tgBot.command('status', async (ctx) => {
    const status = isConnected
        ? `✅ *CONNECTED*\n👤 ${ownerJid?.split(':')[0] || 'Unknown'}\n⏱️ Uptime: ${getUptime()}`
        : `❌ *DISCONNECTED*\n\nUse /pair to reconnect.`;
    ctx.replyWithMarkdown(`🦍 *Alpha-gen Status*\n\n${status}`);
});

// ─── HTTP Keep-Alive (MUST bind before tgBot.launch on Render) ──
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => {
    res.writeHead(200);
    res.end('Alpha-gen alive 🦍');
}).listen(PORT, () => {
    console.log(`✅ HTTP server bound on port ${PORT}`);

    // ─── Launch Telegram AFTER port is bound ────────────────────
    tgBot.launch()
        .then(() => console.log("✅ Alpha-gen System Live. Telegram bot active."))
        .catch(e => console.error("❌ Telegram launch error:", e.message));

    // ─── Start WhatsApp ─────────────────────────────────────────
    startAlphaGen();
});

process.once('SIGINT', () => tgBot.stop('SIGINT'));
process.once('SIGTERM', () => tgBot.stop('SIGTERM'));
