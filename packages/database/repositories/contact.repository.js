const { BaseRepository } = require('./base.repository');
class ContactRepository extends BaseRepository {
  constructor(prisma) { super(prisma, 'contact'); }
  findByList(companyId, listId) { return this.findMany(companyId, { listId }); }
  findByPhone(companyId, listId, phone) { return this.model.findFirst({ where: { companyId: this.requireCompanyId(companyId), listId, phone } }); }
}
module.exports = { ContactRepository };
