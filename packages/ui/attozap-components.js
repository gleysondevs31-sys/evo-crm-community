function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function StatusBadge(status = 'info') {
  const tone = { connected: 'success', running: 'success', completed: 'success', sent: 'success', delivered: 'success', read: 'success', paused: 'warning', qr_required: 'warning', reconnecting: 'warning', pending: 'warning', blocked: 'danger', failed: 'danger', error: 'danger', disconnected: 'danger' }[status] || 'info';
  return `<span class="status-badge ${tone}">${escapeHtml(status)}</span>`;
}

function HealthScoreBadge(score = 100) {
  const value = Number(score || 0);
  const tone = value <= 0 ? 'danger' : value < 30 ? 'danger' : value < 60 ? 'warning' : value < 80 ? 'info' : 'success';
  return `<span class="health-badge ${tone}">${value}/100</span>`;
}

function ProgressBar(value = 0, total = 100) {
  const percent = total ? Math.max(0, Math.min(100, Math.round((Number(value || 0) / Number(total || 1)) * 100))) : 0;
  return `<div class="progress" aria-label="${percent}%"><span style="width:${percent}%"></span></div>`;
}

function MetricCard(label, value, hint = '') {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</article>`;
}

function EmptyState(title, description = '') {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>`;
}

module.exports = { escapeHtml, StatusBadge, HealthScoreBadge, ProgressBar, MetricCard, EmptyState };
