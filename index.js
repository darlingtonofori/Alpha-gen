const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const http = require('http');
const db = require('./database');
const sm = require('./socketManager');

// ─── Config ──────────────────────────────────────────────────────
const TG_TOKEN = process.env.TG_TOKEN || 'YOUR_TOKEN_HERE';
const ADMIN_ID = process.env.ADMIN_ID || ''; // Your Telegram ID
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || '';
const PORT = process.env.PORT || 3000;
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb7Y9OBJkK7FnE9Yzd1L';
const BOT_NAME = 'Alpha-gen';
const BRAND = 'LEBRONDOB';

const tgBot = new Telegraf(TG_TOKEN);
const startTime = Date.now();

function getUptime() {
    const u = Date.now() - startTime;
    return `${Math.floor(u/3600000)}h ${Math.floor(u/60000)%60}m ${Math.floor(u/1000)%60}s`;
}

// ─── Middleware: auto-create user ────────────────────────────────
tgBot.use(async (ctx, next) => {
    if (ctx.from) {
        const user = db.createUser(ctx.from.id, ctx.from.username);
        if (user.is_banned) {
            return ctx.reply('🚫 You are banned from using this bot.');
        }
    }
    return next();
});

// ─── /start ──────────────────────────────────────────────────────
tgBot.start(async (ctx) => {
    const menu =
        `╔══════════════════════════╗\n` +
        `║   🦍 *${BOT_NAME} v2.0*   ║\n` +
        `║     by *${BRAND}*       ║\n` +
        `╚══════════════════════════╝\n\n` +
        `👋 Welcome, *${ctx.from.first_name}*!\n\n` +
        `📋 *Commands:*\n\n` +
        `/setname [name] — Set your display name\n` +
        `/pair [number] — Link your WhatsApp\n` +
        `/status — Check your connection\n` +
        `/stop — Disconnect your WhatsApp\n` +
        `/help — Show this menu\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *MANDATORY:* Follow our channel first:\n` +
        `👉 ${CHANNEL_LINK}\n\n` +
        `Then use */setname* → */pair* to begin.`;

    try {
        const imgPath = path.join(__dirname, 'images', 'menu.jpg');
        if (fs.existsSync(imgPath)) {
            await ctx.replyWithPhoto({ source: imgPath }, { caption: menu, parse_mode: 'Markdown' });
        } else {
            await ctx.replyWithMarkdown(menu);
        }
    } catch(e) {
        await ctx.replyWithMarkdown(menu);
    }
});

tgBot.help(ctx => ctx.reply(
    `📋 *Alpha-gen Commands*\n\n` +
    `/setname [name] — Set display name\n` +
    `/pair [number] — Link WhatsApp\n` +
    `/status — Connection status\n` +
    `/stop — Disconnect WhatsApp\n` +
    `/help — This menu`,
    { parse_mode: 'Markdown' }
));

// ─── /setname ────────────────────────────────────────────────────
tgBot.command('setname', async (ctx) => {
    const name = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!name) return ctx.reply('❌ Usage: /setname YourName\nExample: /setname Dead Man');
    db.setName(ctx.from.id, name);
    ctx.reply(`✅ Name set to: *${name}*\n\nNow use /pair to link WhatsApp.`, { parse_mode: 'Markdown' });
});

// ─── /pair ───────────────────────────────────────────────────────
tgBot.command('pair', async (ctx) => {
    const tid = ctx.from.id;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('❌ Usage: /pair 233XXXXXXXXX');

    const phone = args[1].replace(/[^0-9]/g, '');
    if (phone.length < 10) return ctx.reply('❌ Invalid number. Include country code.\nExample: /pair 233241234567');

    const user = db.getUser(tid);
    if (!user?.name) {
        return ctx.reply(
            '⚠️ Set your name first!\n\n' +
            'Example: /setname Dead Man\n' +
            'Then run /pair again.'
        );
    }

    if (sm.isConnected(tid)) {
        return ctx.reply('✅ Already connected! Use /status to check.\nUse /stop first to relink.');
    }

    db.setPhone(tid, phone);
    db.setStatus(tid, 'pairing');

    await ctx.reply(
        `⚠️ Make sure you followed:\n${CHANNEL_LINK}\n\n` +
        `⏳ Setting up your session...\n` +
        `This takes about 10-15 seconds.`,
        { parse_mode: 'Markdown' }
    );

    await sm.pairUser(
        tid,
        phone,
        // onCode
        async (code) => {
            await ctx.reply(
                `🔑 *YOUR PAIRING CODE:*\n\n` +
                `\`${code}\`\n\n` +
                `📱 *Steps:*\n` +
                `1. Open WhatsApp\n` +
                `2. Tap ⋮ → *Linked Devices*\n` +
                `3. Tap *Link with phone number*\n` +
                `4. Enter the code above\n\n` +
                `⏳ You have *60 seconds!*`,
                { parse_mode: 'Markdown' }
            );
        },
        // onSuccess
        async (sock, jid) => {
            const name = user.name || ctx.from.first_name;
            const welcomeText =
                `╔══════════════════════════╗\n` +
                `║   🦍 *ALPHA-GEN v2.0*   ║\n` +
                `║     by *${BRAND}*       ║\n` +
                `╚══════════════════════════╝\n\n` +
                `👋 Welcome, *${name}*!\n\n` +
                `✅ WhatsApp successfully linked!\n` +
                `🤖 Alpha-gen is now *LIVE*.\n\n` +
                `📋 Type *.menu* to see all commands.\n\n` +
                `📢 Stay updated:\n${CHANNEL_LINK}`;

            try {
                const imgPath = path.join(__dirname, 'images', 'menu.jpg');
                if (fs.existsSync(imgPath)) {
                    await sock.sendMessage(jid, { image: fs.readFileSync(imgPath), caption: welcomeText });
                } else {
                    await sock.sendMessage(jid, { text: welcomeText });
                }
            } catch(_) {}

            await ctx.reply(`🎉 *Connected successfully!*\n\nYour bot is now live on WhatsApp.`, { parse_mode: 'Markdown' });

            // Notify admin
            if (ADMIN_ID) {
                tgBot.telegram.sendMessage(ADMIN_ID,
                    `📲 New user connected!\n👤 ${name}\n📱 ${phone}\n🆔 ${tid}`
                ).catch(() => {});
            }
        },
        // onFail
        async (reason) => {
            db.setStatus(tid, 'unpaired');
            await ctx.reply(
                `❌ *Pairing failed*\n\n${reason}\n\n` +
                `✅ Session auto-cleared.\n` +
                `Just run */pair ${phone}* again!`,
                { parse_mode: 'Markdown' }
            );
        }
    );
});

// ─── /status ─────────────────────────────────────────────────────
tgBot.command('status', async (ctx) => {
    const user = db.getUser(ctx.from.id);
    const connected = sm.isConnected(ctx.from.id);
    const statusEmoji = connected ? '🟢' : '🔴';
    const statusText = connected ? 'CONNECTED' : 'DISCONNECTED';

    ctx.replyWithMarkdown(
        `🦍 *Alpha-gen Status*\n\n` +
        `${statusEmoji} *${statusText}*\n` +
        `👤 Name: ${user?.name || 'Not set'}\n` +
        `📱 Phone: ${user?.phone || 'Not paired'}\n` +
        `📅 Paired: ${user?.paired_at || 'Never'}\n\n` +
        `⏱️ Bot uptime: ${getUptime()}`
    );
});

// ─── /stop ───────────────────────────────────────────────────────
tgBot.command('stop', async (ctx) => {
    const tid = ctx.from.id;
    const entry = sm.getSocket(tid);
    if (entry?.sock) {
        try { entry.sock.ws?.close(); } catch(_) {}
    }
    sm.clearSession(tid);
    db.setDisconnected(tid);
    ctx.reply('🔴 Disconnected. Run /pair to relink.');
});

// ─── ADMIN COMMANDS ──────────────────────────────────────────────
function isAdmin(ctx) {
    return String(ctx.from.id) === String(ADMIN_ID);
}

// /admin_stats
tgBot.command('admin_stats', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('🚫 Admin only.');
    const stats = db.getStats();
    ctx.replyWithMarkdown(
        `📊 *Alpha-gen Stats*\n\n` +
        `👥 Total users: ${stats.total}\n` +
        `🟢 Connected: ${stats.connected}\n` +
        `🚫 Banned: ${stats.banned}\n\n` +
        `⏱️ Uptime: ${getUptime()}`
    );
});

// /admin_users
tgBot.command('admin_users', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('🚫 Admin only.');
    const users = db.getAllUsers().slice(0, 20);
    if (!users.length) return ctx.reply('No users yet.');
    const list = users.map(u =>
        `${u.status === 'connected' ? '🟢' : '🔴'} ${u.name || 'No name'} | ${u.phone || 'unpaired'} | ID: ${u.telegram_id}`
    ).join('\n');
    ctx.reply(`👥 Users (latest 20):\n\n${list}`);
});

// /admin_ban [telegram_id]
tgBot.command('admin_ban', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('🚫 Admin only.');
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('Usage: /admin_ban [telegram_id]');
    db.banUser(id);
    const entry = sm.getSocket(id);
    if (entry?.sock) { try { entry.sock.ws?.close(); } catch(_) {} }
    ctx.reply(`✅ Banned user ${id}`);
});

// /admin_unban [telegram_id]
tgBot.command('admin_unban', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('🚫 Admin only.');
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('Usage: /admin_unban [telegram_id]');
    db.unbanUser(id);
    ctx.reply(`✅ Unbanned user ${id}`);
});

// /admin_broadcast [message]
tgBot.command('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('🚫 Admin only.');
    const msg = ctx.message.text.split(' ').slice(1).join(' ');
    if (!msg) return ctx.reply('Usage: /admin_broadcast [message]');
    const users = db.getAllUsers().filter(u => !u.is_banned);
    let sent = 0;
    for (const u of users) {
        try {
            await tgBot.telegram.sendMessage(u.telegram_id, `📢 *Broadcast:*\n\n${msg}`, { parse_mode: 'Markdown' });
            sent++;
        } catch(_) {}
    }
    ctx.reply(`✅ Broadcast sent to ${sent}/${users.length} users.`);
});

// ─── Resume Sessions on Boot ─────────────────────────────────────
sm.resumeAllSessions(
    (tid, sock, jid) => console.log(`✅ Resumed session: ${tid} → ${jid}`),
    (tid, reason) => console.log(`❌ Session dropped: ${tid} → ${reason}`)
);

// ─── HTTP + Webhook/Polling ──────────────────────────────────────
if (RENDER_URL) {
    const webhookPath = `/tg${TG_TOKEN.slice(-10)}`;
    const webhookUrl = `${RENDER_URL}${webhookPath}`;

    const server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === webhookPath) {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try { await tgBot.handleUpdate(JSON.parse(body)); } catch(_) {}
                res.writeHead(200); res.end('ok');
            });
        } else {
            res.writeHead(200);
            res.end(`Alpha-gen v2.0 by ${BRAND} — alive 🦍`);
        }
    });

    server.listen(PORT, async () => {
        console.log(`✅ HTTP server on port ${PORT}`);
        const tryWebhook = async (n = 0) => {
            try {
                await tgBot.telegram.setWebhook(webhookUrl);
                console.log(`✅ Webhook: ${webhookUrl}`);
            } catch(e) {
                if (n < 10) { setTimeout(() => tryWebhook(n + 1), (n + 1) * 5000); }
                else console.error('❌ Webhook failed after retries.');
            }
        };
        setTimeout(() => tryWebhook(), 5000);
    });
} else {
    // Local Termux — polling
    const server = http.createServer((_, res) => { res.end('alive'); });
    server.listen(PORT, () => {
        console.log(`✅ HTTP on port ${PORT} (polling mode)`);
        tgBot.launch()
            .then(() => console.log('✅ Telegram polling active.'))
            .catch(e => console.error('❌ Telegram error:', e.message));
    });
}

process.once('SIGINT', () => tgBot.stop('SIGINT'));
process.once('SIGTERM', () => tgBot.stop('SIGTERM'));
console.log('🦍 Alpha-gen SaaS booting...');
