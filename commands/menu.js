const fs = require('fs');
const path = require('path');

module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

        const menuText =
            `╔══════════════════════════╗\n` +
            `║   🦍 *ALPHA-GEN v1.0*   ║\n` +
            `║     by *LEBRONDOB*       ║\n` +
            `╚══════════════════════════╝\n\n` +
            `*🛠️ UTILITY*\n` +
            `.menu — Shows this command list\n` +
            `.runtime — How long bot has been running\n` +
            `.tourl — Converts media to a temp link\n` +
            `.trt [lang] [text] — Translates text instantly\n` +
            `.del — Deletes a bot message\n\n` +
            `*🤖 AI*\n` +
            `.aifriend [text] — Chat with AI engine\n\n` +
            `*🎵 MEDIA*\n` +
            `.play [song] — Searches & sends audio\n` +
            `.vv — Recovers view-once media\n` +
            `.steal — Copies a sticker to your pack\n` +
            `.apk [app] — Gets APK download link\n\n` +
            `*⚙️ AUTOMATION*\n` +
            `.autoreact — Toggles auto emoji react on msgs\n` +
            `.sttv — Toggles auto status view & react\n\n` +
            `*👥 GROUP ADMIN*\n` +
            `.kick — Removes a user from group\n` +
            `.promote — Makes a user admin\n` +
            `.demote — Removes admin from a user\n` +
            `.hidetag [text] — Tags everyone silently\n` +
            `.everyone — Tags everyone visibly\n\n` +
            `📢 Follow: ${config.channelLink}`;

        try {
            const imgPath = path.join(__dirname, '..', 'images', 'menu.jpg');
            if (fs.existsSync(imgPath)) {
                const imgBuffer = fs.readFileSync(imgPath);
                await sock.sendMessage(jid, { image: imgBuffer, caption: menuText });
            } else {
                await sock.sendMessage(jid, { text: menuText });
            }
        } catch (e) {
            await sock.sendMessage(jid, { text: menuText });
        }
    }
};
