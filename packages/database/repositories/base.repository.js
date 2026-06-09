const { requireCompanyId, scopedWhere } = require('../scope');

class BaseRepository {
  constructor(prisma, modelName) {
    this.prisma = prisma;
    this.modelName = modelName;
    this.model = prisma[modelName];
  }

  requireCompanyId(companyId) {
    return requireCompanyId(companyId);
  }

  create(data) {
    this.requireCompanyId(data.companyId);
    return this.model.create({ data });
  }

  findById(companyId, id) {
    return this.model.findFirst({ where: scopedWhere(companyId, { id }) });
  }

  findMany(companyId, where = {}, args = {}) {
    return this.model.findMany({ ...args, where: scopedWhere(companyId, where) });
  }

  findByCompany(companyId, args = {}) {
    return this.findMany(companyId, {}, args);
  }

  findByStatus(companyId, status, args = {}) {
    return this.findMany(companyId, { status }, args);
  }

  update(companyId, id, data) {
    return this.model.update({ where: { id, companyId: this.requireCompanyId(companyId) }, data });
  }

  delete(companyId, id) {
    return this.model.delete({ where: { id, companyId: this.requireCompanyId(companyId) } });
  }

  count(companyId, where = {}) {
    return this.model.count({ where: scopedWhere(companyId, where) });
  }
}

module.exports = { BaseRepository };
