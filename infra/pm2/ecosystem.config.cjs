module.exports = {
  apps: [
    { name: 'atto-api', script: 'apps/api/server.js', env: { PORT: 10000 } },
    { name: 'atto-workers', script: 'apps/workers/worker.js' },
    { name: 'atto-whatsapp-gateway', script: 'apps/whatsapp-gateway/gateway.js', env: { WHATSAPP_GATEWAY_PORT: 8081 } },
  ],
};
