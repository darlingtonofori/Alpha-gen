module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message.extendedTextMessage?.contextInfo;
        if (!quoted) return sock.sendMessage(jid, { text: "❌ Reply to a user to demote." });
        const target = quoted.participant;
        try {
            await sock.groupParticipantsUpdate(jid, [target], "demote");
            await sock.sendMessage(jid, { text: `✅ Demoted @${target.split('@')[0]} from admin.`, mentions: [target] });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Need admin rights." });
        }
    }
};
