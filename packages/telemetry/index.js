const metrics = new Map();

function labelKey(labels = {}) {
  return JSON.stringify(Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))));
}

function metricKey(name, labels = {}) {
  return `${name}:${labelKey(labels)}`;
}

function startSpan(name, attributes = {}) {
  return { name, attributes, startedAt: Date.now(), endedAt: null, exceptions: [] };
}

function endSpan(span) {
  if (span) span.endedAt = Date.now();
  return span;
}

function recordException(span, error) {
  if (span) span.exceptions.push({ message: error?.message || String(error), stack: error?.stack, at: new Date().toISOString() });
}

function incrementMetric(name, labels = {}, value = 1) {
  const key = metricKey(name, labels);
  const current = metrics.get(key) || { name, labels, value: 0, type: 'counter' };
  current.value += Number(value || 1);
  metrics.set(key, current);
  return current;
}

function observeMetric(name, labels = {}, value = 0) {
  const key = metricKey(name, labels);
  const current = metrics.get(key) || { name, labels, value: 0, count: 0, sum: 0, type: 'gauge' };
  current.value = Number(value || 0);
  current.count += 1;
  current.sum += Number(value || 0);
  metrics.set(key, current);
  return current;
}

function snapshotMetrics() {
  return [...metrics.values()];
}

module.exports = { startSpan, endSpan, recordException, incrementMetric, observeMetric, snapshotMetrics };
