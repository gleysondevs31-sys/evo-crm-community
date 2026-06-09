const { createDatabase: createMemoryDatabase } = require('./memory');
const { createPrismaDatabase } = require('./prisma');
const { requireCompanyId, assertCompanyScope } = require('./scope');

function resolveDatabaseDriver(config = {}) {
  return (config.databaseDriver || process.env.DATABASE_DRIVER || (process.env.NODE_ENV === 'test' ? 'memory' : 'prisma')).toLowerCase();
}

function validateDatabaseDriver(driver, config = {}) {
  const attoEnv = config.attoEnv || process.env.ATTO_ENV || process.env.NODE_ENV || 'development';
  if (attoEnv === 'production' && driver === 'memory') {
    throw new Error('DATABASE_DRIVER=memory é proibido em ATTO_ENV=production. Configure Prisma/PostgreSQL/SQLite antes de subir.');
  }
}

function createDatabase(config = {}) {
  const driver = resolveDatabaseDriver(config);
  validateDatabaseDriver(driver, config);
  if (driver === 'memory') return createMemoryDatabase();
  if (driver === 'prisma') return createPrismaDatabase(config);
  throw new Error(`DATABASE_DRIVER inválido: ${driver}. Use prisma ou memory.`);
}

module.exports = { createDatabase, createMemoryDatabase, createPrismaDatabase, resolveDatabaseDriver, validateDatabaseDriver, requireCompanyId, assertCompanyScope };
