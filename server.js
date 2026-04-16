const express = require('express');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// Store active pairings
const activePairings = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Debug logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// API: Request REAL pairing code from WhatsApp
app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    
    console.log(`[PAIR] Request for number: ${phoneNumber}`);
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    // Clean phone number (remove + and spaces)
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    if (cleanNumber.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    try {
        const sessionId = `pair_${Date.now()}_${cleanNumber}`;
        const sessionDir = `./sessions/${sessionId}`;
        
        // Ensure session directory exists
        await fs.ensureDir(sessionDir);
        
        // Get auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        console.log(`[PAIR] Creating socket for ${cleanNumber}...`);
        
        // Create socket for pairing
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: ['ALPHA-GEN', 'Chrome', '120.0'],
            auth: state,
            printQRInTerminal: false,
            markOnlineOnConnect: false,
            // Important for Render
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000
        });
        
        // Store pairing info
        activePairings.set(sessionId, {
            sock,
            saveCreds,
            phoneNumber: cleanNumber,
            status: 'pending',
            createdAt: Date.now()
        });
        
        // Request pairing code from WhatsApp
        setTimeout(async () => {
            try {
                console.log(`[PAIR] Requesting code from WhatsApp for ${cleanNumber}...`);
                const code = await sock.requestPairingCode(cleanNumber);
                
                console.log(`✅ REAL pairing code for ${cleanNumber}: ${code}`);
                
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    pairingCode: code,
                    status: 'code_generated'
                });
                
                // Auto cleanup after 10 minutes
                setTimeout(() => {
                    if (activePairings.has(sessionId)) {
                        activePairings.delete(sessionId);
                        console.log(`🧹 Cleaned up session ${sessionId}`);
                    }
                }, 10 * 60 * 1000);
                
            } catch (err) {
                console.error(`❌ Failed to get pairing code:`, err);
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
                console.log(`[PAIR] Sending code to client for ${cleanNumber}`);
                res.json({
                    success: true,
                    pairingCode: session.pairingCode,
                    sessionId: sessionId,
                    message: 'Enter this code in WhatsApp Linked Devices'
                });
            } else if (session?.status === 'error') {
                clearInterval(checkInterval);
                res.status(500).json({ error: session.error });
            }
            attempts++;
            if (attempts > 30) { // 30 seconds timeout
                clearInterval(checkInterval);
                if (!activePairings.get(sessionId)?.pairingCode) {
                    console.log(`[PAIR] Timeout for ${cleanNumber}`);
                    res.status(408).json({ error: 'Timeout waiting for pairing code from WhatsApp' });
                }
            }
        }, 1000);
        
        // Handle successful connection
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            console.log(`[PAIR] Connection update for ${cleanNumber}: ${connection}`);
            
            if (connection === 'open') {
                console.log(`✅ Bot connected successfully for ${cleanNumber}!`);
                sock.ev.on('creds.update', saveCreds);
                
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    status: 'connected'
                });
                
                // Send welcome message
                setTimeout(async () => {
                    try {
                        await sock.sendMessage(`${cleanNumber}@s.whatsapp.net`, { 
                            text: `✅ *ALPHA-GEN Bot Connected!*\n\nSend *.ping* to test if bot is working.\nSend *.menu* for all commands.` 
                        });
                    } catch(e) {
                        console.log('Welcome message error:', e.message);
                    }
                }, 2000);
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(`❌ Disconnected for ${cleanNumber}. Reconnect: ${shouldReconnect}`);
                if (!shouldReconnect) {
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
                
                console.log(`[MSG] ${from}: ${body}`);
                
                // Simple command handler
                if (body === '.ping') {
                    await sock.sendMessage(from, { text: '🏓 Pong! Bot is working perfectly!' });
                } else if (body === '.menu') {
                    const menu = `╭━━━━━━━━━━━━━━━╮
┃  ✨ *ALPHA-GEN* ✨
┃  🤖 Bot is Online!
╰━━━━━━━━━━━━━━━╯

📱 *Test Commands:*
• .ping - Check if bot works
• .menu - Show this menu  
• .time - Current server time
• .alive - Bot status

✅ Your bot is connected!`;
                    await sock.sendMessage(from, { text: menu });
                } else if (body === '.time') {
                    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
                    await sock.sendMessage(from, { text: `🕐 Server Time: ${now}` });
                } else if (body === '.alive') {
                    await sock.sendMessage(from, { text: '✅ ALPHA-GEN is alive and running!' });
                }
            }
        });
        
    } catch (error) {
        console.error('[PAIR] Fatal error:', error);
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
        version: '2.0.0',
        status: 'active',
        activeSessions: activePairings.size
    });
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 ALPHA-GEN Server Running!`);
    console.log(`📍 Web UI: http://localhost:${PORT}`);
    console.log(`📱 Users can enter their number to get REAL pairing code from WhatsApp\n`);
    console.log(`✅ Ready to generate pairing codes!`);
});

// Cleanup old sessions every hour
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of activePairings.entries()) {
        if (now - session.createdAt > 30 * 60 * 1000) { // 30 minutes
            activePairings.delete(id);
            console.log(`🧹 Cleaned expired session: ${id}`);
        }
    }
}, 60 * 60 * 1000);
