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

// Generate random 8-digit code for custom pairing
const generateCustomCode = () => {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
};

// API: Request pairing code from WhatsApp
app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    
    console.log(`[PAIR] Request for: ${phoneNumber}`);
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    // Clean phone number - remove + and spaces, keep only numbers
    let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // Remove leading 62 if present (Indonesia) or adjust for your country
    // Keep the number as is - user should enter with country code
    if (cleanNumber.startsWith('0')) {
        cleanNumber = cleanNumber.substring(1);
    }
    
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number. Use country code (e.g., 919876543210)' });
    }
    
    // Add @s.whatsapp.net for proper JID format if needed
    const fullJid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
    
    try {
        const sessionId = `session_${Date.now()}_${cleanNumber.substring(0, 5)}`;
        const sessionDir = `./sessions/${sessionId}`;
        
        await fs.ensureDir(sessionDir);
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        console.log(`[PAIR] Creating socket for ${cleanNumber}...`);
        
        // Create socket with correct configuration
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['ALPHA-GEN', 'Chrome', '120.0.0.0'],
            markOnlineOnConnect: true,
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
                // Generate custom 8-digit code
                const customCode = generateCustomCode();
                console.log(`[PAIR] Using custom code: ${customCode}`);
                
                // Request pairing with custom 8-digit code
                const code = await sock.requestPairingCode(cleanNumber, customCode);
                
                console.log(`✅ WhatsApp pairing code for ${cleanNumber}: ${code}`);
                
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    pairingCode: code,
                    customCode: customCode,
                    status: 'code_generated'
                });
                
                // Clean up after 15 minutes
                setTimeout(() => {
                    if (activePairings.has(sessionId)) {
                        activePairings.delete(sessionId);
                        console.log(`🧹 Cleaned session ${sessionId}`);
                    }
                }, 15 * 60 * 1000);
                
            } catch (err) {
                console.error(`❌ Pairing failed for ${cleanNumber}:`, err.message);
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    error: err.message,
                    status: 'error'
                });
            }
        }, 1000);
        
        // Wait for code and send response
        let attempts = 0;
        const maxAttempts = 45; // 45 seconds max wait
        
        const checkInterval = setInterval(() => {
            const session = activePairings.get(sessionId);
            
            if (session?.status === 'code_generated' && session?.pairingCode) {
                clearInterval(checkInterval);
                console.log(`[PAIR] Sending code ${session.pairingCode} to client`);
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
            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                const session = activePairings.get(sessionId);
                if (!session?.pairingCode) {
                    console.log(`[PAIR] Timeout for ${cleanNumber}`);
                    res.status(408).json({ error: 'Timeout waiting for pairing code from WhatsApp' });
                }
            }
        }, 1000);
        
        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅✅✅ Bot CONNECTED successfully for ${cleanNumber}! ✅✅✅`);
                sock.ev.on('creds.update', saveCreds);
                
                activePairings.set(sessionId, {
                    ...activePairings.get(sessionId),
                    status: 'connected'
                });
                
                // Send welcome message
                try {
                    await sock.sendMessage(fullJid, { 
                        text: `╭━━━━━━━━━━━━━━━╮
┃  ✨ *ALPHA-GEN* ✨
┃  🤖 Connected Successfully!
╰━━━━━━━━━━━━━━━╯

📱 *Test Commands:*
• .ping - Check if bot works
• .menu - Show all commands  
• .time - Current server time
• .alive - Bot status

✅ Your bot is ready!` 
                    });
                    console.log(`[PAIR] Welcome message sent to ${cleanNumber}`);
                } catch(e) {
                    console.log(`Welcome message error:`, e.message);
                }
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`❌ Disconnected for ${cleanNumber}. Code: ${statusCode}, Reconnect: ${shouldReconnect}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
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
                
                // Command handler
                if (body === '.ping') {
                    await sock.sendMessage(from, { text: '🏓 Pong! Bot is working perfectly!' });
                } 
                else if (body === '.menu') {
                    const menu = `╭━━━━━━━━━━━━━━━╮
┃  ✨ *ALPHA-GEN* ✨
┃  🤖 WhatsApp Bot
╰━━━━━━━━━━━━━━━╯

📱 *Working Commands:*
• .ping - Check bot status
• .menu - Show this menu
• .time - Server time
• .alive - Bot alive check

⚡ *Status:* 🟢 Online
🔧 *Version:* 2.0.0

> Powered by Baileys`;
                    await sock.sendMessage(from, { text: menu });
                }
                else if (body === '.time') {
                    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
                    await sock.sendMessage(from, { text: `🕐 *Server Time*\n${now}\nTimezone: Asia/Kolkata` });
                }
                else if (body === '.alive') {
                    await sock.sendMessage(from, { text: '✅ ALPHA-GEN is alive and running smoothly!' });
                }
                else if (body === '.info') {
                    const info = `📱 *ALPHA-GEN Bot Info*
━━━━━━━━━━━━━━━━
• Name: ALPHA-GEN
• Version: 2.0.0
• Status: 🟢 Online
• Platform: WhatsApp Web
• Library: Baileys

💡 *About*
Demo version for testing.
Send .menu for commands.`;
                    await sock.sendMessage(from, { text: info });
                }
            }
        });
        
        // Handle connection errors
        sock.ev.on('connection.error', (err) => {
            console.error(`[SOCKET ERROR] ${err.message}`);
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

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║         ALPHA-GEN WhatsApp Bot             ║
╠════════════════════════════════════════════╣
║  Status: 🟢 Running                        ║
║  Port: ${PORT}                                ║
║  Web UI: http://localhost:${PORT}            ║
╠════════════════════════════════════════════╣
║  📱 How to use:                            ║
║  1. Open the web page                      ║
║  2. Enter your number with country code    ║
║  3. Click "Generate Pairing Code"          ║
║  4. Enter 8-digit code in WhatsApp         ║
║  5. Send .ping to test!                    ║
╚════════════════════════════════════════════╝
    `);
});

// Clean up old sessions every hour
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of activePairings.entries()) {
        if (now - session.createdAt > 30 * 60 * 1000) {
            activePairings.delete(id);
            console.log(`🧹 Cleaned expired session: ${id}`);
        }
    }
}, 60 * 60 * 1000);
