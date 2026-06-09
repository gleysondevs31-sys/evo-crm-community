const { join } = require('node:path');
const { mkdirSync } = require('node:fs');

async function createBaileysSession(input, handlers, settings) {
  const baileys = await import('@whiskeysockets/baileys');
  const sessionPath = join(settings.sessionsDir, input.companyId, input.connectionId);
  mkdirSync(sessionPath, { recursive: true });
  const { state, saveCreds } = await baileys.useMultiFileAuthState(sessionPath);
  const socket = baileys.default({ auth: state, printQRInTerminal: false });

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', (update) => handlers.onConnectionUpdate?.(update));
  socket.ev.on('messages.upsert', (event) => handlers.onMessagesUpsert?.(event));
  socket.ev.on('messages.update', (event) => handlers.onMessagesUpdate?.(event));
  socket.ev.on('message-receipt.update', (event) => handlers.onMessageReceiptUpdate?.(event));

  return { socket, sessionPath };
}

module.exports = { createBaileysSession };
