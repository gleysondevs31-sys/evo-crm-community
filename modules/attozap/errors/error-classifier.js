const CATEGORIES = {
  TEMPORARY: 'TEMPORARY',
  PERMANENT: 'PERMANENT',
  CONNECTION_RISK: 'CONNECTION_RISK',
};

const RULES = [
  { pattern: /invalid phone|jid not found|malformed|unsupported media|bad jid/i, category: CATEGORIES.PERMANENT, code: 'invalid_payload', retryable: false, message: 'Payload, telefone ou mídia inválida.' },
  { pattern: /blocked by contact|contact blocked|not on whatsapp/i, category: CATEGORIES.PERMANENT, code: 'contact_unreachable', retryable: false, message: 'Contato indisponível ou bloqueou a linha.' },
  { pattern: /logged out|banned|ban|spam|connection replaced|bad session|auth failure|forbidden|401|403/i, category: CATEGORIES.CONNECTION_RISK, code: 'connection_risk', retryable: false, shouldDegradeConnection: true, shouldBlockConnection: true, recommendedDelayMs: 300000, message: 'Risco crítico na conexão WhatsApp.' },
  { pattern: /too many requests|rate limit|429/i, category: CATEGORIES.CONNECTION_RISK, code: 'rate_limited', retryable: true, shouldDegradeConnection: true, shouldBlockConnection: false, recommendedDelayMs: 120000, message: 'Rate limit do provedor detectado.' },
  { pattern: /timeout|network|econn|socket not ready|disconnected|gateway unavailable|502|503|504/i, category: CATEGORIES.TEMPORARY, code: 'temporary_gateway_error', retryable: true, shouldDegradeConnection: false, shouldBlockConnection: false, recommendedDelayMs: 30000, message: 'Erro temporário no gateway/conexão.' },
];

function classifyDeliveryError(error) {
  const detail = typeof error === 'string' ? error : [error?.code, error?.message, error?.statusCode].filter(Boolean).join(' ');
  const rule = RULES.find((item) => item.pattern.test(detail || ''));
  if (rule) return { recommendedDelayMs: 5000, shouldDegradeConnection: false, shouldBlockConnection: false, raw: detail, ...rule };
  return { category: CATEGORIES.TEMPORARY, code: 'unknown_delivery_error', retryable: true, shouldDegradeConnection: false, shouldBlockConnection: false, recommendedDelayMs: 30000, message: 'Erro temporário não classificado.', raw: detail };
}

module.exports = { CATEGORIES, classifyDeliveryError };
