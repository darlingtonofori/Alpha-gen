const express = require('express');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// Store active pairing requests
const activePairings = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Request pairing code
app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    // Clean phone number (remove + and spaces)
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    if (cleanNumber.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    try {
        // Create a new pairing session
        const sessionId = `pair_${Date.now()}_${cleanNumber}`;
        const sessionDir = `./sessions/${sessionId}`;
        
        // Ensure session directory exists
        await fs.ensureDir(sessionDir);
        
        // Get auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        // Create socket for pairing
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: ['ALPHA-GEN', 'Chrome', '120.0'],
            auth: state,
            printQRInTerminal: false,
            markOnlineOnConnect: false
        });
        
        // Store pairing info
        activePairings.set(sessionId, {
            sock,
            saveCreds,
            phoneNumber: cleanNumber,
            status: 'pending',
            createdAt: Date.now()
        });
        
        // Request pairing code
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    pairingCode: code,
                    status: 'code_generated'
                });
                
                // Send code to user via response (stored for polling)
                console.log(`📱 Pairing code for ${cleanNumber}: ${code}`);
                
                // Auto cleanup after 5 minutes
                setTimeout(() => {
                    if (activePairings.has(sessionId)) {
                        activePairings.delete(sessionId);
                        console.log(`🧹 Cleaned up session ${sessionId}`);
                    }
                }, 5 * 60 * 1000);
                
            } catch (err) {
                console.error(`Failed to get pairing code for ${cleanNumber}:`, err);
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    error: err.message,
                    status: 'error'
                });
            }
        }, 1000);
        
        // Wait for code (max 15 seconds)
        let attempts = 0;
        const checkInterval = setInterval(() => {
            const session = activePairings.get(sessionId);
            if (session?.status === 'code_generated') {
                clearInterval(checkInterval);
                res.json({
                    success: true,
                    pairingCode: session.pairingCode,
                    sessionId: sessionId,
                    message: 'Use this code in WhatsApp Linked Devices'
                });
            } else if (session?.status === 'error') {
                clearInterval(checkInterval);
                res.status(500).json({ error: session.error });
            }
            attempts++;
            if (attempts > 30) { // 15 seconds timeout
                clearInterval(checkInterval);
                if (!activePairings.get(sessionId)?.pairingCode) {
                    res.status(408).json({ error: 'Timeout waiting for pairing code' });
                }
            }
        }, 500);
        
        // Handle connection success
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ Bot connected for ${cleanNumber}!`);
                // Save credentials
                sock.ev.on('creds.update', saveCreds);
                
                // Update status
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    status: 'connected',
                    sock: sock
                });
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (!shouldReconnect) {
                    console.log(`❌ Session logged out for ${cleanNumber}`);
                    activePairings.delete(sessionId);
                }
            }
        });
        
        // Handle incoming messages (test commands)
        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const msg of messages) {
                if (!msg.message) continue;
                
                const from = msg.key.remoteJid;
                let body = '';
                
                if (msg.message.conversation) body = msg.message.conversation;
                else if (msg.message.extendedTextMessage?.text) body = msg.message.extendedTextMessage.text;
                
                if (!body) continue;
                
                // Handle test commands
                if (body === '.ping') {
                    await sock.sendMessage(from, { text: '🏓 Pong! Bot is working!' });
                } else if (body === '.menu') {
                    const menu = `╭━━━━━━━━━━━━━━━╮
┃  ✨ *ALPHA-GEN* ✨
┃  🤖 Bot is Online!
╰━━━━━━━━━━━━━━━╯

📱 *Test Commands:*
• .ping - Check bot
• .menu - Show menu
• .time - Server time

✅ Your bot is working!`;
                    await sock.sendMessage(from, { text: menu });
                } else if (body === '.time') {
                    const now = new Date().toLocaleString();
                    await sock.sendMessage(from, { text: `🕐 Server Time: ${now}` });
                }
            }
        });
        
    } catch (error) {
        console.error('Pairing error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Check session status
app.get('/api/status/:sessionId', (req, res) => {
    const session = activePairings.get(req.params.sessionId);
    if (session) {
        res.json({
            status: session.status,
            phoneNumber: session.phoneNumber
        });
    } else {
        res.json({ status: 'not_found' });
    }
});

// API: Get bot info
app.get('/api/info', (req, res) => {
    res.json({
        botName: 'ALPHA-GEN',
        version: '1.0.0',
        status: 'active',
        activeSessions: activePairings.size
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 ALPHA-GEN Server Running!`);
    console.log(`📍 Web UI: http://localhost:${PORT}`);
    console.log(`📱 Users can enter their number to get pairing code\n`);
});
