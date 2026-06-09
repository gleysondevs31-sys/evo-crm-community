const { randomUUID } = require('node:crypto');

function getCorrelationId(headers = {}) {
  return headers['x-correlation-id'] || headers['X-Correlation-Id'] || randomUUID();
}

function attachCorrelation(req, res) {
  const correlationId = getCorrelationId(req.headers || {});
  if (typeof res?.setHeader === 'function') res.setHeader('x-correlation-id', correlationId);
  return correlationId;
}

module.exports = { getCorrelationId, attachCorrelation };
