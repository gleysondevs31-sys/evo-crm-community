class CompanyRepository {
  constructor(prisma) { this.prisma = prisma; this.model = prisma.company; }
  create(data) { return this.model.create({ data }); }
  findById(id) { return this.model.findUnique({ where: { id } }); }
  findMany(_companyId, where = {}, args = {}) { return this.model.findMany({ ...args, where }); }
  findByCompany(companyId) { return this.findById(companyId).then((company) => company ? [company] : []); }
  findByStatus(_companyId, status) { return this.model.findMany({ where: { status } }); }
  update(id, data) { return this.model.update({ where: { id }, data }); }
  delete(id) { return this.model.delete({ where: { id } }); }
  count() { return this.model.count(); }
}
module.exports = { CompanyRepository };
