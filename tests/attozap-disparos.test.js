const assert = require('node:assert/strict');
const { createAttoFlowApp } = require('../apps/api/composition');
const { normalizeBrazilianPhone, renderTemplate } = require('../modules/attozap');
const { createQueue, validateQueueReadiness } = require('../packages/queue');
const { GatewayClient } = require('../modules/attozap/gateway/gateway-client');
const { validateGatewayReadiness } = require('../modules/attozap/gateway/readiness');

async function main() {
  assert.throws(() => createQueue({ attoEnv: 'production', queueDriver: 'memory', redisUrl: '', queueMessageSend: 'attozap.message.send' }), /QUEUE_DRIVER deve ser bullmq|memory é proibido/);
  const gatewayBlocked = await validateGatewayReadiness({ attoEnv: 'production', baileysEnabled: false, whatsappGatewayUrl: '', dryRun: true, whatsappSessionsDir: './storage/test-sessions' });
  assert.equal(gatewayBlocked.productionReady, false);
  assert.equal(gatewayBlocked.blockers.includes('baileysDisabled'), true);
  const dryRunClient = new GatewayClient({ attoEnv: 'production', whatsappGatewayUrl: 'http://gateway.local', internalApiToken: 't' });
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true, dryRun: true, provider: 'baileys' }) });
  await assert.rejects(() => dryRunClient.sendMessage({ connectionId: 'x' }), /dryRun/);
  global.fetch = originalFetch;

  const blocked = validateQueueReadiness({ attoEnv: 'production', queueDriver: 'bullmq', redisUrl: '' }, { redisConnected: false });
  assert.equal(blocked.productionReady, false);
  assert.equal(blocked.blockers.some((item) => item.includes('REDIS_URL') || item.includes('Redis')), true);

  const gatewayClient = {
    createSession: async ({ companyId, connectionId }) => ({ ok: true, companyId, connectionId, status: 'qr_required', provider: 'baileys', qrCode: 'qr-test', sessionPath: `storage/test/${companyId}/${connectionId}`, dryRun: false }),
    sendMessage: async ({ connectionId }) => ({ ok: true, provider: 'baileys', dryRun: false, messageId: `baileys-test-${connectionId}` }),
    health: async () => ({ ok: true, provider: 'baileys', dryRun: false }),
  };
  const app = createAttoFlowApp({ gatewayClient });
  const ctx = { companyId: app.config.defaultCompanyId, userId: app.config.defaultUserId, role: 'owner', can: () => true };

  const normalized = normalizeBrazilianPhone('(11) 98888-7777');
  assert.equal(normalized.phone, '5511988887777');
  assert.equal(normalized.valid, true);
  assert.equal(normalizeBrazilianPhone('123').valid, false);

  assert.equal(renderTemplate('Olá {{nome}}, {tudo bem?|como vai?}', { nome: 'Ana' }), 'Olá Ana, tudo bem?');

  const connection = await app.attozap.createConnection(ctx, { name: 'Teste', phoneNumber: '11977776666', delayMinMs: 0, delayMaxMs: 0, dailyLimit: 10, hourlyLimit: 10 });
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
  const duplicateStart = await app.attozap.startCampaign(ctx, campaign.id).catch((error) => error);
  assert.match(duplicateStart.message, /Campanha não pode iniciar/);

  await app.attozap.pauseCampaign(ctx, campaign.id);
  assert.equal((await app.queue.list({ campaignId: campaign.id }))[0].status, 'paused');
  await assert.rejects(() => app.attozap.processMessageJob(ctx, jobs[0].payload.messageJobId), /Campanha não está ativa/);
  await app.attozap.resumeCampaign(ctx, campaign.id);
  assert.equal((await app.queue.list({ campaignId: campaign.id }))[0].status, 'queued');

  const drained = await app.queue.drain();
  assert.equal(drained[0].status, 'completed');
  const completed = await app.attozap.getCampaign(ctx, campaign.id);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.totalSent, 1);

  const canceledCampaign = await app.attozap.createCampaign(ctx, { name: 'Cancelar', connectionId: connection.id, contactListId: list.id, message: 'Olá {{nome}}' });
  await app.attozap.startCampaign(ctx, canceledCampaign.id);
  await app.attozap.cancelCampaign(ctx, canceledCampaign.id);
  const canceledJobs = await app.queue.list({ campaignId: canceledCampaign.id });
  assert.equal(canceledJobs[0].status, 'canceled');
  await assert.rejects(() => app.attozap.processMessageJob(ctx, canceledJobs[0].payload.messageJobId), /Campanha não está ativa/);

  const sentRecovered = await app.recovery;
  assert.equal(typeof sentRecovered.jobs, 'number');
  const queueHealth = await app.queue.health();
  assert.equal(queueHealth.queueDriver, 'memory');

  console.log('attozap-disparos tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
