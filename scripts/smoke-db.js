const assert = require('node:assert/strict');
const { createDatabase } = require('../packages/database');

async function main() {
  if (process.env.DATABASE_DRIVER === 'memory') {
    throw new Error('smoke:db deve rodar com DATABASE_DRIVER=prisma, nunca com memória.');
  }

  const database = createDatabase({ databaseDriver: 'prisma', attoEnv: process.env.ATTO_ENV || 'development' });
  await database.prisma.$connect();

  const suffix = Date.now();
  const companyId = `company_smoke_${suffix}`;
  const userId = `user_smoke_${suffix}`;
  const connectionId = `wa_smoke_${suffix}`;
  const listId = `list_smoke_${suffix}`;
  const contactId = `contact_smoke_${suffix}`;
  const campaignId = `camp_smoke_${suffix}`;
  const idempotencyKey = `send:${companyId}:${campaignId}:${contactId}`;

  try {
    await database.repositories.companies.create({ id: companyId, name: 'Smoke Empresa', slug: `smoke-${suffix}`, status: 'active' });
    await database.repositories.users.create({ id: userId, companyId, name: 'Smoke Owner', email: `smoke-${suffix}@attoflow.local`, role: 'owner', status: 'active' });
    const connection = await database.createWhatsappConnection({ id: connectionId, companyId, name: 'Smoke WA', phoneNumber: `55119${String(suffix).slice(-8).padStart(8, '0')}`, status: 'connected', delayMinMs: 0, delayMaxMs: 0 });
    const list = await database.createContactList({ id: listId, companyId, name: 'Smoke Lista', source: 'smoke' });
    const contact = await database.createContact({ id: contactId, companyId, listId: list.id, name: 'Smoke Contato', phone: '5511988887777', rawPhone: '(11) 98888-7777', status: 'valid', tags: ['smoke'], customFields: { canal: 'whatsapp' } });
    await database.updateContactListStats(companyId, list.id);
    const campaign = await database.createCampaign({ id: campaignId, companyId, name: 'Smoke Campanha', connectionId: connection.id, contactListId: list.id, message: 'Olá {{nome}}', totalContacts: 1, totalPending: 1 });
    await database.addCampaignContact({ companyId, campaignId: campaign.id, contactId: contact.id });
    const job = await database.createMessageJob({ companyId, campaignId: campaign.id, contactId: contact.id, connectionId: connection.id, message: 'Olá Smoke', idempotencyKey, queueJobId: idempotencyKey, scheduledAt: new Date().toISOString() });
    const duplicateJob = await database.createMessageJob({ companyId, campaignId: campaign.id, contactId: contact.id, connectionId: connection.id, message: 'Olá Smoke', idempotencyKey, queueJobId: idempotencyKey, scheduledAt: new Date().toISOString() });
    assert.equal(job.id, duplicateJob.id);
    await database.createMessageLog({ companyId, campaignId: campaign.id, connectionId: connection.id, messageJobId: job.id, contactId: contact.id, type: 'smoke.created', status: 'info', metadata: { smoke: true } });
    await database.updateMessageJob(companyId, job.id, { status: 'sent', sentAt: new Date().toISOString(), providerMessageId: 'smoke-message-id' });
    const readBack = await database.getMessageJob(companyId, job.id);
    assert.equal(readBack.status, 'sent');
    const logs = await database.listMessageLogs(companyId, { campaignId: campaign.id });
    assert.equal(logs.length >= 1, true);
    await database.deleteCampaign(companyId, campaign.id);
    console.log(JSON.stringify({ ok: true, driver: database.driver, companyId, jobId: job.id, logs: logs.length }, null, 2));
  } finally {
    await database.prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.messageLog.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.messageJob.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.campaignContact.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.campaign.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.contact.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.contactList.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.messageTemplate.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.whatsAppConnection.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.user.deleteMany({ where: { companyId } }).catch(() => {});
    await database.prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
    await database.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
