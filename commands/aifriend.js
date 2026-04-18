const axios = require('axios');
module.exports = {
    async execute(sock, msg, text) {
        const jid = msg.key.remoteJid;
        const query = text.replace('.aifriend', '').trim();
        if (!query) return sock.sendMessage(jid, { text: "❌ Usage: .aifriend [your question]" });
        try {
            const res = await axios.get(`https://uncloseai.com/api/chat?q=${encodeURIComponent(query)}`);
            await sock.sendMessage(jid, { text: res.data.reply || res.data.result || "❌ No response." });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ AI engine failed." });
        }
    }
};
