const axios = require('axios');
module.exports = {
    async execute(sock, msg, text) {
        const jid = msg.key.remoteJid;
        const query = text.replace('.play', '').trim();
        if (!query) return sock.sendMessage(jid, { text: "❌ Usage: .play song name" });
        try {
            await sock.sendMessage(jid, { text: `🔍 Searching: *${query}*...` });
            const res = await axios.get(`https://yt-search-api.vercel.app/search?query=${encodeURIComponent(query)}`);
            const video = res.data?.results?.[0];
            if (!video) return sock.sendMessage(jid, { text: "❌ No results found." });
            const dlRes = await axios.get(`https://yt-dl-api.vercel.app/download?url=${encodeURIComponent(video.url)}&format=mp3`);
            const audioUrl = dlRes.data?.downloadUrl;
            if (!audioUrl) return sock.sendMessage(jid, { text: `❌ Couldn't fetch audio.\n🔗 ${video.url}` });
            const audioBuffer = await axios.get(audioUrl, { responseType: 'arraybuffer' });
            await sock.sendMessage(jid, {
                audio: Buffer.from(audioBuffer.data),
                mimetype: 'audio/mp4',
                ptt: false,
                fileName: `${video.title}.mp3`
            });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Play failed. Try another song." });
        }
    }
};
