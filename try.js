/**
 * .try — Demo test command for ALPHA-GEN
 */

module.exports = {
  name: 'try',
  aliases: ['test', 'ping'],
  description: 'Test if ALPHA-GEN is alive and responding',
  vipOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, { from, sender, senderNumber, isOwner, isVip, reply, react }) {
    await react('⚡');

    const status = isOwner
      ? '👑 *Owner*'
      : isVip
      ? '💎 *VIP Member*'
      : '🆓 *Free User*';

    const text =
      `╭━━━━━━━━━━━━━━━━━╮\n` +
      `┃   ⚡ *ALPHA-GEN BOT* ⚡\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n` +
      `✅ Bot is *ONLINE* and running!\n\n` +
      `👤 *Your Number:* ${senderNumber}\n` +
      `🏷️ *Your Status:* ${status}\n\n` +
      `🤖 *Bot:* ALPHA-GEN\n` +
      `⚡ *Prefix:* \`.\`\n` +
      `📡 *Response:* Active\n\n` +
      `> _Type .menu to see all commands_`;

    await reply(text);
  },
};
