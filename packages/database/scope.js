function requireCompanyId(companyId) {
  if (!companyId || typeof companyId !== 'string') {
    throw new Error('companyId obrigatório para operação multiempresa.');
  }
  return companyId;
}

function assertCompanyScope(record, companyId, label = 'registro') {
  requireCompanyId(companyId);
  if (!record) return record;
  if (record.companyId !== companyId) {
    throw new Error(`Escopo multiempresa inválido para ${label}.`);
  }
  return record;
}

function scopedWhere(companyId, extra = {}) {
  return { companyId: requireCompanyId(companyId), ...extra };
}

module.exports = { requireCompanyId, assertCompanyScope, scopedWhere };
