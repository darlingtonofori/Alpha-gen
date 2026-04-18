module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message.extendedTextMessage?.contextInfo;
        if (!quoted) return sock.sendMessage(jid, { text: "❌ Reply to a user to promote." });
        const target = quoted.participant;
        try {
            await sock.groupParticipantsUpdate(jid, [target], "promote");
            await sock.sendMessage(jid, { text: `✅ Promoted @${target.split('@')[0]} to admin.`, mentions: [target] });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Need admin rights." });
        }
    }
};
