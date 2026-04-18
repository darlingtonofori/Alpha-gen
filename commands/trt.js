const axios = require('axios');
module.exports = {
    async execute(sock, msg, text) {
        const jid = msg.key.remoteJid;
        const args = text.split(' ');
        if (args.length < 3) return sock.sendMessage(jid, { text: "❌ Usage: .trt en Hello world" });
        const lang = args[1];
        const query = args.slice(2).join(' ');
        try {
            const res = await axios.get(`https://translate.googleapis.com/translate_a/single`, {
                params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: query }
            });
            const translated = res.data[0].map(x => x[0]).join('');
            await sock.sendMessage(jid, { text: `🌐 *${lang.toUpperCase()}:* ${translated}` });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Translation failed." });
        }
    }
};
