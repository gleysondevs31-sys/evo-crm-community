function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  if (missing.length) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  return payload;
}

function sanitizeText(value) {
  return String(value || '').replace(/[<>]/g, '').trim();
}

module.exports = { requireFields, sanitizeText };
