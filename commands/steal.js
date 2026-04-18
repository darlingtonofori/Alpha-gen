const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted?.stickerMessage) return sock.sendMessage(jid, { text: "❌ Reply to a sticker." });
        try {
            const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.sendMessage(jid, { sticker: buffer });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Failed to steal sticker." });
        }
    }
};
