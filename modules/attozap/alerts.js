const { randomUUID } = require('node:crypto');

function createAttozapAlerts() {
  const alerts = [];

  function create(input) {
    const existing = alerts.find((alert) => alert.status === 'open' && alert.type === input.type && alert.companyId === input.companyId && alert.source === input.source);
    if (existing) return existing;
    const alert = {
      id: input.id || `alert_${randomUUID().slice(0, 8)}`,
      companyId: input.companyId || null,
      severity: input.severity || 'warning',
      type: input.type,
      title: input.title || input.type,
      message: input.message || '',
      source: input.source || 'attozap',
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      metadata: input.metadata || {},
    };
    alerts.unshift(alert);
    return alert;
  }

  function list(filters = {}) {
    return alerts.filter((alert) => (!filters.companyId || !alert.companyId || alert.companyId === filters.companyId) && (!filters.status || alert.status === filters.status));
  }

  function resolve(id, metadata = {}) {
    const alert = alerts.find((item) => item.id === id);
    if (!alert) return null;
    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.metadata = { ...alert.metadata, resolved: metadata };
    return alert;
  }

  function evaluate({ companyId, health = {}, queue = {}, gateway = {} } = {}) {
    if (gateway.gatewayReachable === false) create({ companyId, type: 'gateway.down', severity: 'critical', title: 'Gateway WhatsApp indisponível', source: 'gateway', metadata: gateway });
    if (queue.redisConnected === false && queue.queueDriver === 'bullmq') create({ companyId, type: 'redis.down', severity: 'critical', title: 'Redis indisponível', source: 'queue', metadata: queue });
    if ((queue.failed || 0) >= 10) create({ companyId, type: 'queue.failed_spike', severity: 'warning', title: 'Pico de falhas na fila', source: 'queue', metadata: queue });
    if ((health.connectionsBlocked || 0) > 0) create({ companyId, type: 'connection.blocked', severity: 'critical', title: 'Conexão bloqueada', source: 'attozap', metadata: health });
    if ((health.connectionsCritical || 0) > 0) create({ companyId, type: 'connection.critical', severity: 'critical', title: 'Conexão crítica', source: 'attozap', metadata: health });
    if ((health.pendingAcks || 0) >= 25) create({ companyId, type: 'ack.pending_spike', severity: 'warning', title: 'ACKs pendentes acima do normal', source: 'attozap', metadata: health });
    if ((health.stuckJobs || 0) > 0) create({ companyId, type: 'campaign.stuck', severity: 'warning', title: 'Jobs/campanhas travados', source: 'attozap', metadata: health });
    return list({ companyId, status: 'open' });
  }

  return { create, list, resolve, evaluate };
}

module.exports = { createAttozapAlerts };
