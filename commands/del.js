module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message.extendedTextMessage?.contextInfo;
        if (!quoted) return sock.sendMessage(jid, { text: "❌ Reply to a bot message to delete it." });
        try {
            await sock.sendMessage(jid, {
                delete: {
                    remoteJid: jid,
                    fromMe: true,
                    id: quoted.stanzaId
                }
            });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Can only delete bot's own messages." });
        }
    }
};
