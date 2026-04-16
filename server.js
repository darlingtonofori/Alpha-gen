const express = require('express');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Store active pairing requests
const pairingRequests = new Map();

// API endpoint to request pairing code
app.post('/api/request-pairing', async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    // Clean number
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // Create unique session ID for this request
    const sessionId = Date.now().toString();
    const sessionDir = `./sessions/${sessionId}`;
    
    // Ensure session directory exists
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // Send immediate response
    res.json({ 
        success: true, 
        sessionId: sessionId,
        message: 'Pairing code requested. Check terminal for code.'
    });
    
    // Start pairing process (non-blocking)
    setTimeout(async () => {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion();
            
            const sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                browser: ['Ubuntu', 'Chrome', '20.0.00']
            });
            
            // Request pairing code from WhatsApp
            const code = await sock.requestPairingCode(cleanNumber);
            
            console.log(`\n========================================`);
            console.log(`📱 Phone: ${cleanNumber}`);
            console.log(`🔑 PAIRING CODE: ${code}`);
            console.log(`========================================\n`);
            
            // Store the code for later retrieval via API
            pairingRequests.set(sessionId, {
                phoneNumber: cleanNumber,
                pairingCode: code,
                timestamp: Date.now(),
                status: 'ready'
            });
            
            sock.ev.on('connection.update', (update) => {
                if (update.connection === 'open') {
                    console.log(`✅ Bot connected for ${cleanNumber}`);
                }
            });
            
            sock.ev.on('creds.update', saveCreds);
            
        } catch (error) {
            console.error(`❌ Pairing failed for ${cleanNumber}:`, error.message);
            pairingRequests.set(sessionId, {
                phoneNumber: cleanNumber,
                error: error.message,
                status: 'failed'
            });
        }
    }, 1000);
});

// API endpoint to get the pairing code (poll this)
app.get('/api/get-code/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const request = pairingRequests.get(sessionId);
    
    if (!request) {
        return res.json({ status: 'pending', message: 'Waiting for code...' });
    }
    
    if (request.status === 'ready') {
        return res.json({ 
            status: 'ready', 
            pairingCode: request.pairingCode,
            phoneNumber: request.phoneNumber
        });
    }
    
    if (request.status === 'failed') {
        return res.json({ status: 'failed', error: request.error });
    }
    
    res.json({ status: 'pending' });
});

// Simple web page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>ALPHA-GEN - Request Pairing Code</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 { color: #333; margin-bottom: 10px; }
        input {
            width: 100%;
            padding: 15px;
            margin: 15px 0;
            border: 2px solid #ddd;
            border-radius: 10px;
            font-size: 16px;
        }
        button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            cursor: pointer;
        }
        button:disabled {
            opacity: 0.5;
        }
        .code {
            font-size: 32px;
            font-weight: bold;
            text-align: center;
            padding: 20px;
            background: #f0f0f0;
            border-radius: 10px;
            margin: 20px 0;
            letter-spacing: 5px;
        }
        .hidden { display: none; }
        .error { color: red; }
        .success { color: green; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 ALPHA-GEN</h1>
        <p>Enter your WhatsApp number to get a pairing code</p>
        
        <input type="tel" id="phone" placeholder="e.g., 919876543210" />
        <button id="requestBtn" onclick="requestCode()">Request Pairing Code</button>
        
        <div id="result" class="hidden">
            <div id="codeDisplay" class="code"></div>
            <p>✅ Enter this code in WhatsApp → Linked Devices → Link a Device</p>
        </div>
        
        <div id="error" class="error hidden"></div>
    </div>

    <script>
        let currentSessionId = null;
        
        async function requestCode() {
            const phone = document.getElementById('phone').value;
            if (!phone) {
                alert('Enter your phone number');
                return;
            }
            
            const btn = document.getElementById('requestBtn');
            btn.disabled = true;
            btn.textContent = 'Requesting...';
            
            try {
                const response = await fetch('/api/request-pairing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber: phone })
                });
                
                const data = await response.json();
                currentSessionId = data.sessionId;
                
                // Poll for the code
                pollForCode();
                
            } catch (error) {
                document.getElementById('error').textContent = error.message;
                document.getElementById('error').classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Request Pairing Code';
            }
        }
        
        async function pollForCode() {
            const response = await fetch(`/api/get-code/${currentSessionId}`);
            const data = await response.json();
            
            if (data.status === 'ready') {
                document.getElementById('codeDisplay').textContent = data.pairingCode;
                document.getElementById('result').classList.remove('hidden');
                document.getElementById('requestBtn').disabled = false;
                document.getElementById('requestBtn').textContent = 'Request Pairing Code';
                console.log('Code received:', data.pairingCode);
            } else if (data.status === 'failed') {
                document.getElementById('error').textContent = data.error;
                document.getElementById('error').classList.remove('hidden');
                document.getElementById('requestBtn').disabled = false;
                document.getElementById('requestBtn').textContent = 'Request Pairing Code';
            } else {
                // Still pending, check again in 2 seconds
                setTimeout(pollForCode, 2000);
            }
        }
    </script>
</body>
</html>
    `);
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    console.log('Enter your phone number on the webpage');
    console.log('Pairing code will appear in BOTH terminal AND webpage');
});
