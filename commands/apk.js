const axios = require('axios');
module.exports = {
    async execute(sock, msg, text) {
        const jid = msg.key.remoteJid;
        const query = text.replace('.apk', '').trim();
        if (!query) return sock.sendMessage(jid, { text: "❌ Usage: .apk WhatsApp" });
        const searchUrl = `https://apkpure.com/search?q=${encodeURIComponent(query)}`;
        await sock.sendMessage(jid, {
            text: `🔍 *APK Search: ${query}*\n\n📦 APKPure:\n${searchUrl}`
        });
    }
};
