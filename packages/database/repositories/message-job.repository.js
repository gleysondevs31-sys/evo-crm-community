const { BaseRepository } = require('./base.repository');
class MessageJobRepository extends BaseRepository {
  constructor(prisma) { super(prisma, 'messageJob'); }
  findByCampaign(companyId, campaignId) { return this.findMany(companyId, { campaignId }); }
  findPending(companyId, campaignId) { return this.findMany(companyId, { ...(campaignId ? { campaignId } : {}), status: { in: ['pending', 'queued', 'sending'] } }); }
  findRunning(companyId) { return this.findMany(companyId, { status: 'sending' }); }
  findByIdempotencyKey(companyId, idempotencyKey) { return this.model.findFirst({ where: { companyId: this.requireCompanyId(companyId), idempotencyKey } }); }
}
module.exports = { MessageJobRepository };
