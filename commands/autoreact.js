module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        // Toggle: read current state from sock, flip it, return new state
        const current = sock._autoReact || false;
        const newState = !current;
        await sock.sendMessage(jid, {
            text: newState
                ? `✅ *Auto React ON*\nI'll react to every message with a random emoji.`
                : `❌ *Auto React OFF*\nStopped reacting to messages.`
        });
        return newState; // returned to index.js to update state
    }
};
