module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message.extendedTextMessage?.contextInfo;
        if (!quoted) return sock.sendMessage(jid, { text: "❌ Reply to a user to kick." });
        const target = quoted.participant;
        try {
            await sock.groupParticipantsUpdate(jid, [target], "remove");
            await sock.sendMessage(jid, { text: `✅ Kicked @${target.split('@')[0]}`, mentions: [target] });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Need admin rights." });
        }
    }
};
