module.exports = {
    async execute(sock, msg, text) {
        const jid = msg.key.remoteJid;
        const message = text.replace('.hidetag', '').trim() || '.';
        try {
            const meta = await sock.groupMetadata(jid);
            const members = meta.participants.map(p => p.id);
            await sock.sendMessage(jid, { text: message, mentions: members });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Groups only." });
        }
    }
};
