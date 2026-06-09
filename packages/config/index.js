function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const config = {
  appName: 'ATTO FLOW Community',
  env: process.env.NODE_ENV || 'development',
  port: numberFromEnv('PORT', 10000),
  apiBaseUrl: process.env.ATTO_API_BASE_URL || '',
  defaultCompanyId: process.env.ATTO_DEFAULT_COMPANY_ID || 'company_atto_demo',
  defaultUserId: process.env.ATTO_DEFAULT_USER_ID || 'user_owner_demo',
  databaseUrl: process.env.DATABASE_URL || 'file:./storage/atto-flow.sqlite',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  queueDriver: process.env.QUEUE_DRIVER || process.env.ATTO_QUEUE_DRIVER || 'memory',
  queueMessageSend: process.env.QUEUE_MESSAGE_SEND || 'attozap.message.send',
  queueConcurrency: numberFromEnv('QUEUE_CONCURRENCY', 5),
  queueMaxAttempts: numberFromEnv('QUEUE_MAX_ATTEMPTS', 3),
  queueBackoffMs: numberFromEnv('QUEUE_BACKOFF_MS', 5000),
  whatsappSessionsDir: process.env.WHATSAPP_SESSIONS_DIR || './storage/whatsapp-sessions',
  baileysEnabled: process.env.ATTO_BAILEYS_ENABLED === 'true',
  gatewayReconnectAttempts: numberFromEnv('WHATSAPP_RECONNECT_ATTEMPTS', 5),
};

module.exports = { config, numberFromEnv };
