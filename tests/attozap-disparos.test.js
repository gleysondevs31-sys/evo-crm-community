const assert = require('node:assert/strict');
const { createAttoFlowApp } = require('../apps/api/composition');
const { normalizeBrazilianPhone, renderTemplate } = require('../modules/attozap');

async function main() {
  const app = createAttoFlowApp();
  const ctx = { companyId: app.config.defaultCompanyId, userId: app.config.defaultUserId, role: 'owner', can: () => true };

  const normalized = normalizeBrazilianPhone('(11) 98888-7777');
  assert.equal(normalized.phone, '5511988887777');
  assert.equal(normalized.valid, true);
  assert.equal(normalizeBrazilianPhone('123').valid, false);

  assert.equal(renderTemplate('Olá {{nome}}, {tudo bem?|como vai?}', { nome: 'Ana' }), 'Olá Ana, tudo bem?');

  const connection = await app.attozap.createConnection(ctx, { name: 'Teste', phoneNumber: '11977776666', delayMinMs: 0, delayMaxMs: 0, dailyLimit: 1, hourlyLimit: 1 });
  assert.equal(connection.status, 'qr_required');
  await app.attozap.updateConnectionStatus(ctx, connection.id, 'connected');

  const list = await app.attozap.createContactList(ctx, {
    name: 'Teste Import',
    raw: 'Ana;(11) 98888-7777;vip;interesse A\nAna Dup;11988887777;vip\nInválido;123',
  });
  assert.equal(list.validContacts, 1);
  assert.equal(list.duplicateContacts, 1);
  assert.equal(list.invalidContacts, 1);

  const campaign = await app.attozap.createCampaign(ctx, { name: 'Teste Campanha', connectionId: connection.id, contactListId: list.id, message: 'Olá {{nome}}' });
  assert.equal(campaign.totalContacts, 1);

  const started = await app.attozap.startCampaign(ctx, campaign.id);
  assert.equal(started.status, 'running');
  const jobs = await app.queue.list({ campaignId: campaign.id });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, `send:${ctx.companyId}:${campaign.id}:${jobs[0].payload.contactId}`);

  await app.attozap.pauseCampaign(ctx, campaign.id);
  assert.equal((await app.queue.list({ campaignId: campaign.id }))[0].status, 'paused');
  await app.attozap.resumeCampaign(ctx, campaign.id);
  assert.equal((await app.queue.list({ campaignId: campaign.id }))[0].status, 'queued');

  const drained = await app.queue.drain();
  assert.equal(drained[0].status, 'completed');
  const completed = await app.attozap.getCampaign(ctx, campaign.id);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.totalSent, 1);

  const blockedCampaign = await app.attozap.createCampaign(ctx, { name: 'Limite', connectionId: connection.id, contactListId: list.id, message: 'Olá {{nome}}' });
  await assert.rejects(() => app.attozap.startCampaign(ctx, blockedCampaign.id), /Limite por hora|Limite diário/);

  const recovered = await app.recovery;
  assert.equal(typeof recovered.jobs, 'number');

  console.log('attozap-disparos tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
