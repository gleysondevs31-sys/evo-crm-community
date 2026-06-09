const { BaseRepository } = require('./base.repository');
class ConnectionRepository extends BaseRepository {
  constructor(prisma) { super(prisma, 'whatsAppConnection'); }
  findConnected(companyId) { return this.findByStatus(companyId, 'connected'); }
  findRunning(companyId) { return this.findMany(companyId, { status: { in: ['connected', 'reconnecting'] } }); }
  updateStats(companyId, id, data) { return this.update(companyId, id, data); }
}
module.exports = { ConnectionRepository };
