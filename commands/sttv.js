module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const current = sock._statusView || false;
        const newState = !current;
        await sock.sendMessage(jid, {
            text: newState
                ? `✅ *Status View ON*\nI'll automatically view & react to all statuses.`
                : `❌ *Status View OFF*\nStopped viewing statuses.`
        });
        return newState; // returned to index.js to update state
    }
};
