/**
 * ALPHA-GEN Message Handler
 */

const config = require('./config');
const db = require('./database');
const fs = require('fs');
const path = require('path');

// Load all commands from ./commands folder
const loadCommands = () => {
  const map = new Map();
  const cmdDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(cmdDir)) return map;

  const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const cmd = require(path.join(cmdDir, file));
      map.set(cmd.name, cmd);
      if (cmd.aliases) cmd.aliases.forEach(a => map.set(a, cmd));
    } catch (e) {
      console.error(`Failed to load command ${file}:`, e.message);
    }
  }
  console.log(`✅ Loaded ${files.length} commands`);
  return map;
};

const commands = loadCommands();

// Check if sender is owner
const isOwner = (sender) => {
  const num = sender.split('@')[0].split(':')[0];
  return config.ownerNumber.includes(num);
};

// Handle incoming message
const handleMessage = async (sock, msg) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const senderNumber = sender.split('@')[0].split(':')[0];
    const isGroup = from.endsWith('@g.us');

    // Extract message text
    const content = msg.message;
    const body =
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      content?.videoMessage?.caption ||
      '';

    if (!body.startsWith(config.prefix)) return;

    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = commands.get(commandName);
    if (!command) return;

    // ── Permission checks ──────────────────────────

    // Owner only
    if (command.ownerOnly && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.ownerOnly }, { quoted: msg });
    }

    // VIP only
    if (command.vipOnly && !isOwner(sender)) {
      if (!db.isVip(senderNumber)) {
        const plans = config.plans;
        return sock.sendMessage(from, {
          text:
            `╭━━━━━━━━━━━━━━━╮\n` +
            `┃  💎 *VIP COMMAND* 💎\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n` +
            `🔒 *${commandName}* requires VIP access.\n\n` +
            `📦 *Plans:*\n` +
            `┣ Basic — ${plans.basic} days\n` +
            `┣ Standard — ${plans.standard} days\n` +
            `┗ Premium — ${plans.premium} days\n\n` +
            `📩 *Subscribe:* wa.me/${config.ownerNumber[0]}\n\n` +
            `> _ALPHA-GEN Bot_`
        }, { quoted: msg });
      }
    }

    // Group only
    if (command.groupOnly && !isGroup) {
      return sock.sendMessage(from, { text: config.messages.groupOnly }, { quoted: msg });
    }

    // Private only
    if (command.privateOnly && isGroup) {
      return sock.sendMessage(from, { text: config.messages.privateOnly }, { quoted: msg });
    }

    // Typing indicator
    if (config.autoTyping) {
      await sock.sendPresenceUpdate('composing', from).catch(() => {});
    }

    // Execute
    await command.execute(sock, msg, args, {
      from,
      sender,
      senderNumber,
      isGroup,
      isOwner: isOwner(sender),
      isVip: db.isVip(senderNumber),
      reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
    });

  } catch (err) {
    console.error('handleMessage error:', err.message);
  }
};

module.exports = { handleMessage };
