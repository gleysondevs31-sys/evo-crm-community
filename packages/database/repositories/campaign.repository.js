const { BaseRepository } = require('./base.repository');
class CampaignRepository extends BaseRepository {
  constructor(prisma) { super(prisma, 'campaign'); }
  findPending(companyId) { return this.findMany(companyId, { status: { in: ['draft', 'scheduled'] } }); }
  findRunning(companyId) { return this.findByStatus(companyId, 'running'); }
}
module.exports = { CampaignRepository };
