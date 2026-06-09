const { randomUUID } = require('node:crypto');

const LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];

function serializeError(error) {
  if (!error) return {};
  if (typeof error === 'string') return { errorMessage: error };
  return {
    errorCode: error.code || error.name,
    errorMessage: error.message,
    errorStack: error.stack,
  };
}

function createLogEntry(level, message, metadata = {}) {
  const errorFields = metadata.error instanceof Error ? serializeError(metadata.error) : {};
  const { error, ...rest } = metadata;
  return {
    level: LEVELS.includes(level) ? level : 'info',
    timestamp: new Date().toISOString(),
    service: rest.service || process.env.ATTO_SERVICE_NAME || 'atto-flow',
    environment: rest.environment || process.env.ATTO_ENV || process.env.NODE_ENV || 'development',
    correlationId: rest.correlationId || randomUUID(),
    companyId: rest.companyId,
    userId: rest.userId,
    campaignId: rest.campaignId,
    connectionId: rest.connectionId,
    jobId: rest.jobId || rest.messageJobId,
    eventType: rest.eventType || rest.type,
    message,
    errorCode: rest.errorCode || errorFields.errorCode,
    errorStack: rest.errorStack || errorFields.errorStack,
    metadata: rest.metadata || Object.fromEntries(Object.entries(rest).filter(([key, value]) => value !== undefined && !['service', 'environment', 'correlationId', 'companyId', 'userId', 'campaignId', 'connectionId', 'jobId', 'messageJobId', 'eventType', 'type', 'errorCode', 'errorStack'].includes(key))),
  };
}

function log(level, message, metadata = {}) {
  const entry = createLogEntry(level, message, metadata);
  const line = JSON.stringify(entry);
  if (['error', 'fatal'].includes(entry.level)) console.error(line);
  else console.log(line);
  return entry;
}

const logger = Object.fromEntries(LEVELS.map((level) => [level, (message, metadata) => log(level, message, metadata)]));

module.exports = { logger, log, createLogEntry, serializeError };
