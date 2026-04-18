const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');
module.exports = {
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return sock.sendMessage(jid, { text: "❌ Reply to an image or video." });
        const type = quoted.imageMessage ? 'image' : quoted.videoMessage ? 'video' : null;
        if (!type) return sock.sendMessage(jid, { text: "❌ Image or video only." });
        try {
            const stream = await downloadContentFromMessage(quoted[`${type}Message`], type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const ext = type === 'image' ? 'jpg' : 'mp4';
            const form = new FormData();
            form.append('file', buffer, { filename: `upload.${ext}` });
            const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
                headers: form.getHeaders()
            });
            const url = res.data?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            await sock.sendMessage(jid, { text: `🔗 *Temp URL:*\n${url}` });
        } catch (e) {
            await sock.sendMessage(jid, { text: "❌ Upload failed." });
        }
    }
};
