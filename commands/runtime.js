const startTime = Date.now();
module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const uptime = Date.now() - startTime;
        const s = Math.floor(uptime / 1000) % 60;
        const m = Math.floor(uptime / 60000) % 60;
        const h = Math.floor(uptime / 3600000);
        await sock.sendMessage(jid, {
            text: `⏱️ *Alpha-gen Runtime*\n\n🕐 ${h}h ${m}m ${s}s\n\n🦍 by LEBRONDOB`
        });
    }
};
