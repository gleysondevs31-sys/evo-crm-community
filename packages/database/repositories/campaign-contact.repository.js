const { BaseRepository } = require('./base.repository');
class CampaignContactRepository extends BaseRepository {
  constructor(prisma) { super(prisma, 'campaignContact'); }
  findByCampaign(companyId, campaignId) { return this.findMany(companyId, { campaignId }); }
  findPending(companyId, campaignId) { return this.findMany(companyId, { campaignId, status: { in: ['pending', 'queued', 'sending'] } }); }
  findByCampaignContact(companyId, campaignId, contactId) { return this.model.findFirst({ where: { companyId: this.requireCompanyId(companyId), campaignId, contactId } }); }
  updateByCampaignContact(companyId, campaignId, contactId, data) { return this.model.update({ where: { companyId_campaignId_contactId: { companyId: this.requireCompanyId(companyId), campaignId, contactId } }, data }); }
}
module.exports = { CampaignContactRepository };
