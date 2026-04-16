/**
 * ALPHA-GEN Bot Configuration
 */

module.exports = {
  // Owner
  ownerNumber: ['233247504050'], // e.g. 2348012345678 (no + or spaces)
  ownerName: 'Alpha',

  // Bot Identity
  botName: 'ALPHA-GEN',
  prefix: '.',
  sessionName: 'alpha_session',
  sessionID: process.env.SESSION_ID || '',

  // Behavior
  autoRead: false,
  autoTyping: true,
  selfMode: false,

  // Messages
  messages: {
    ownerOnly: '👑 This command is for bot owner only!',
    vipOnly: '💎 This is a VIP command! Subscribe to unlock.',
    groupOnly: '👥 This command only works in groups!',
    privateOnly: '💬 This command only works in private chat!',
    adminOnly: '🛡️ Admins only!',
    botAdminNeeded: '🤖 Make me admin first!',
    error: '❌ Something went wrong.',
  },

  // Subscription Plans (days)
  plans: {
    basic: 7,
    standard: 30,
    premium: 90,
  },
};
