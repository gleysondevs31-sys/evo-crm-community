const integrations = [
  { id: 'meta', name: 'Meta Ads', status: 'available', category: 'ads' },
  { id: 'google-sheets', name: 'Google Sheets', status: 'available', category: 'productivity' },
  { id: 'webhooks', name: 'Webhooks', status: 'available', category: 'api' },
  { id: 'email', name: 'E-mail SMTP', status: 'planned', category: 'omnichannel' },
  { id: 'telegram', name: 'Telegram', status: 'planned', category: 'omnichannel' },
];

function createIntegrationsModule() {
  return { list: () => integrations };
}

module.exports = { createIntegrationsModule };
