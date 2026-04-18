module.exports = {
    async execute(sock, msg, text) {
        const jid = msg.key.remoteJid;
        const message = text.replace('.everyone', '').trim() || '📢 Attention!';
        try {
            const meta = await sock.groupMetadata(jid);
            const members = meta.participants.map(p => p.id);
            const mentionText = members.map(m => `@${m.split('@')[0]}`).join(' ');
            await sock.sendMessage(jid, {
                text: `${message}\n\n${mentionText}`,
                mentions: members
            });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Groups only." });
        }
    }
};
