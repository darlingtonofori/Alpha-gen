const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const viewOnce = quoted?.viewOnceMessageV2 || quoted?.viewOnceMessage;
        if (!viewOnce) return sock.sendMessage(jid, { text: "❌ Reply to a view-once message." });
        const mediaType = Object.keys(viewOnce.message)[0];
        try {
            const stream = await downloadContentFromMessage(viewOnce.message[mediaType], mediaType.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
            await sock.sendMessage(jid, { [mediaType.replace('Message', '')]: buffer, caption: "✅ Recovered by Alpha-gen" });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Recovery failed." });
        }
    }
};
