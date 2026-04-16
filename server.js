const express = require('express');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

const activePairings = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// THE FIX - requestPairingCode with SECOND PARAMETER
app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    
    console.log(`[PAIR] Request for: ${phoneNumber}`);
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    if (cleanNumber.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    try {
        const sessionId = `pair_${Date.now()}`;
        const sessionDir = `./sessions/${sessionId}`;
        
        await fs.ensureDir(sessionDir);
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        // CRITICAL FIX: browser array format and proper config
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '20.0.00'],  // Fixed format
            markOnlineOnConnect: false
        });
        
        activePairings.set(sessionId, { sock, saveCreds, phoneNumber: cleanNumber, status: 'pending' });
        
        // THE FIX IS HERE - second parameter 'true' or config.setPair
        setTimeout(async () => {
            try {
                // THIS IS THE KEY - second parameter makes it work
                const code = await sock.requestPairingCode(cleanNumber, true);
                
                console.log(`✅ REAL WhatsApp pairing code for ${cleanNumber}: ${code}`);
                
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    pairingCode: code,
                    status: 'code_generated'
                });
                
                // Send response back to client
                const session = activePairings.get(sessionId);
                if (session && session.pairingCode) {
                    // Response already sent below, just log
                }
                
                // Auto cleanup after 10 minutes
                setTimeout(() => {
                    if (activePairings.has(sessionId)) {
                        activePairings.delete(sessionId);
                        console.log(`🧹 Cleaned session ${sessionId}`);
                    }
                }, 10 * 60 * 1000);
                
            } catch (err) {
                console.error(`❌ Pairing failed:`, err);
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    error: err.message,
                    status: 'error'
                });
            }
        }, 1000);
        
        // Wait for code and send response
        let attempts = 0;
        const checkInterval = setInterval(() => {
            const session = activePairings.get(sessionId);
            if (session?.status === 'code_generated') {
                clearInterval(checkInterval);
                console.log(`[PAIR] Sending code for ${cleanNumber}`);
                res.json({
                    success: true,
                    pairingCode: session.pairingCode,
                    sessionId: sessionId,
                    message: 'Enter this 8-digit code in WhatsApp Linked Devices'
                });
            } else if (session?.status === 'error') {
                clearInterval(checkInterval);
                res.status(500).json({ error: session.error });
            }
            attempts++;
            if (attempts > 30) {
                clearInterval(checkInterval);
                if (!activePairings.get(sessionId)?.pairingCode) {
                    res.status(408).json({ error: 'Timeout waiting for pairing code' });
                }
            }
        }, 1000);
        
        // Handle successful connection
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ Bot connected for ${cleanNumber}!`);
                sock.ev.on('creds.update', saveCreds);
                
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    status: 'connected'
                });
                
                // Send welcome message
                setTimeout(async () => {
                    try {
                        await sock.sendMessage(`${cleanNumber}@s.whatsapp.net`, { 
                            text: `✅ *ALPHA-GEN Connected!*\n\nSend *.ping* to test.\nSend *.menu* for commands.` 
                        });
                    } catch(e) {
                        console.log('Welcome message error:', e.message);
                    }
                }, 2000);
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (!shouldReconnect) {
                    activePairings.delete(sessionId);
                }
            }
        });
        
        // Handle incoming messages
        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const msg of messages) {
                if (!msg.message) continue;
                
                const from = msg.key.remoteJid;
                let body = '';
                
                if (msg.message.conversation) body = msg.message.conversation;
                else if (msg.message.extendedTextMessage?.text) body = msg.message.extendedTextMessage.text;
                
                if (!body) continue;
                
                console.log(`[MSG] ${from}: ${body}`);
                
                if (body === '.ping') {
                    await sock.sendMessage(from, { text: '🏓 Pong! Bot is working!' });
                } else if (body === '.menu') {
                    await sock.sendMessage(from, { text: `╭━━━━━━━━━━━━━━━╮\n┃ ✨ ALPHA-GEN ✨\n┃ 🤖 Online\n╰━━━━━━━━━━━━━━━╯\n\n📱 Commands:\n• .ping - Check bot\n• .menu - This menu\n• .time - Server time` });
                } else if (body === '.time') {
                    await sock.sendMessage(from, { text: `🕐 ${new Date().toLocaleString()}` });
                }
            }
        });
        
    } catch (error) {
        console.error('[PAIR] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/status/:sessionId', (req, res) => {
    const session = activePairings.get(req.params.sessionId);
    res.json({ status: session?.status || 'not_found' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 ALPHA-GEN Running on port ${PORT}`);
    console.log(`📍 Web UI: http://localhost:${PORT}\n`);
});
