const http = require('http');
// This creates a simple server to satisfy Render's port check
http.createServer((req, res) => {
  res.write("ALPHA-GEN is Online");
  res.end();
}).listen(process.env.PORT || 8080); 

/**
 * ALPHA-GEN WhatsApp Bot
 * Built on Baileys
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const readline = require('readline');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const handler = require('./handler');

async function startBot() {
  const sessionFolder = `./${config.sessionName}`;

  // Session from env string (for hosting)
  if (config.sessionID && config.sessionID.startsWith('ALPHAGEN!')) {
    try {
      const zlib = require('zlib');
      const b64 = config.sessionID.split('!')[1];
      const compressed = Buffer.from(b64, 'base64');
      const creds = zlib.gunzipSync(compressed);
      if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });
      fs.writeFileSync(path.join(sessionFolder, 'creds.json'), creds, 'utf8');
      console.log('🔑 Session loaded from ALPHAGEN! string');
    } catch (e) {
      console.error('❌ Failed to load session string:', e.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['ALPHA-GEN', 'Chrome', '1.0.0'],
    auth: state,
    generateHighQualityLinkPreview: true,
    mobile: false, // required for pair code to work
  });

  // Request pair code if not yet authenticated
  if (!sock.authState.creds.registered) {
    // Get number from env or prompt
    let phoneNumber = process.env.PHONE_NUMBER || config.ownerNumber[0];

    if (!phoneNumber) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      phoneNumber = await new Promise(resolve => {
        rl.question('📱 Enter your WhatsApp number (e.g. 2348012345678): ', ans => {
          rl.close();
          resolve(ans.trim());
        });
      });
    }

    // Strip any non-digits
    phoneNumber = phoneNumber.replace(/\D/g, '');

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        const formatted = code.match(/.{1,4}/g).join('-'); // e.g. ABCD-EFGH
        console.log(`\n╭━━━━━━━━━━━━━━━━━╮`);
        console.log(`┃  🔑 PAIR CODE`);
        console.log(`╰━━━━━━━━━━━━━━━━━╯`);
        console.log(`\n   👉  ${formatted}\n`);
        console.log(`Go to WhatsApp → Linked Devices → Link with phone number\n`);
      } catch (e) {
        console.error('❌ Failed to get pair code:', e.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`⚠️ Connection closed (${code}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) setTimeout(startBot, 3000);
    }

    if (connection === 'open') {
      console.log(`\n✅ ALPHA-GEN connected!`);
      console.log(`📱 Number: ${sock.user.id.split(':')[0]}`);
      console.log(`👑 Owner: ${config.ownerNumber[0]}\n`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Route messages to handler
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || !msg.key?.id) continue;
      const from = msg.key.remoteJid;
      if (!from || from.includes('@broadcast') || from.includes('status')) continue;
      handler.handleMessage(sock, msg).catch(err => {
        if (!err.message?.includes('rate-overlimit')) {
          console.error('Handler error:', err.message);
        }
      });
    }
  });

  return sock;
}

console.log('🚀 Starting ALPHA-GEN...\n');
startBot().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err?.message));
