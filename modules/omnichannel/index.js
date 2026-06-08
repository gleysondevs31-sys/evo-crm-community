const channels = [
  { id: 'whatsapp', name: 'WhatsApp', status: 'active' },
  { id: 'instagram', name: 'Instagram', status: 'planned' },
  { id: 'messenger', name: 'Facebook Messenger', status: 'planned' },
  { id: 'email', name: 'E-mail', status: 'planned' },
  { id: 'telegram', name: 'Telegram', status: 'planned' },
  { id: 'webchat', name: 'Webchat', status: 'planned' },
  { id: 'api', name: 'API externa', status: 'active' },
];

function createOmnichannelModule() {
  return { channels: () => channels };
}

module.exports = { createOmnichannelModule, channels };
