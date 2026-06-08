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
};

module.exports = { config };
