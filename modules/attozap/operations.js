function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function healthState(score) {
  if (score <= 0) return 'blocked';
  if (score < 30) return 'critical';
  if (score < 60) return 'degraded';
  if (score < 80) return 'watch';
  return 'healthy';
}

function scoreDelta(event) {
  return { sent: 1, delivered: 1, read: 1, replied: 2, temporary_failure: -5, permanent_failure: -3, connection_failure: -15, block_suspected: -40, banned: -100 }[event] || 0;
}

function applyHealthEvent(connection, event) {
  const nextScore = clampScore((connection.healthScore ?? 100) + scoreDelta(event));
  const state = healthState(nextScore);
  const now = new Date().toISOString();
  return {
    healthScore: nextScore,
    healthState: state,
    lastSuccessAt: ['sent', 'delivered', 'read', 'replied'].includes(event) ? now : connection.lastSuccessAt,
    lastFailureAt: event.includes('failure') || event.includes('block') || event === 'banned' ? now : connection.lastFailureAt,
    consecutiveFailures: ['sent', 'delivered', 'read', 'replied'].includes(event) ? 0 : (connection.consecutiveFailures || 0) + 1,
    degradedAt: ['degraded', 'critical'].includes(state) ? (connection.degradedAt || now) : connection.degradedAt,
    blockedAt: state === 'blocked' ? (connection.blockedAt || now) : connection.blockedAt,
  };
}

function adaptiveLimits(connection) {
  const state = connection.healthState || healthState(connection.healthScore ?? 100);
  const rules = {
    healthy: { delayMultiplier: 1, hourlyMultiplier: 1 },
    watch: { delayMultiplier: 1.25, hourlyMultiplier: 0.8 },
    degraded: { delayMultiplier: 1.75, hourlyMultiplier: 0.5 },
    critical: { delayMultiplier: 2.5, hourlyMultiplier: 0.2 },
    blocked: { delayMultiplier: Infinity, hourlyMultiplier: 0 },
  }[state];
  return {
    state,
    delayMinMs: Math.round((connection.delayMinMs || 0) * rules.delayMultiplier),
    delayMaxMs: Math.round((connection.delayMaxMs || 0) * rules.delayMultiplier),
    hourlyLimit: Math.max(0, Math.floor((connection.hourlyLimit || 0) * rules.hourlyMultiplier)),
    blocked: state === 'blocked',
  };
}

module.exports = { clampScore, healthState, applyHealthEvent, adaptiveLimits };
