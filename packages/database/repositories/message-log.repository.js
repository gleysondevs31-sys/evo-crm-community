const { BaseRepository } = require('./base.repository');
class MessageLogRepository extends BaseRepository {
  constructor(prisma) { super(prisma, 'messageLog'); }
  findByCampaign(companyId, campaignId) { return this.findMany(companyId, { campaignId }, { orderBy: { createdAt: 'desc' } }); }
}
module.exports = { MessageLogRepository };
