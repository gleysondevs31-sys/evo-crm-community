const assert = require('node:assert/strict');
const { createAttoFlowApp } = require('../apps/api/composition');

async function main() {
  if (!process.env.TEST_PHONE) throw new Error('TEST_PHONE obrigatório para smoke:send.');
  const app = createAttoFlowApp({ registerQueueProcessors: true });
  const ctx = { companyId: app.config.defaultCompanyId, userId: app.config.defaultUserId, role: 'owner', can: () => true };
  const health = await app.gatewayClient.health();
  if (health.provider !== 'baileys' || health.dryRun) throw new Error('Gateway precisa estar com provider=baileys e dryRun=false.');
  const connections = await app.attozap.listConnections(ctx);
  const connection = connections.find((item) => item.status === 'connected');
  if (!connection) throw new Error('Nenhuma sessão connected. Escaneie o QR antes de rodar smoke:send.');
  const list = await app.attozap.createContactList(ctx, { name: `Smoke Send ${Date.now()}`, raw: `Smoke;${process.env.TEST_PHONE};smoke` });
  const campaign = await app.attozap.createCampaign(ctx, { name: `Smoke Send ${Date.now()}`, connectionId: connection.id, contactListId: list.id, message: 'Smoke ATTOZAP DISPAROS' });
  await app.attozap.startCampaign(ctx, campaign.id);
  let updated;
  let sent;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    updated = await app.attozap.getCampaign(ctx, campaign.id);
    sent = updated.jobs.find((job) => job.status === 'sent' && job.providerMessageId);
    if (sent) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(Boolean(sent), true);
  console.log(JSON.stringify({ ok: true, campaignId: campaign.id, providerMessageId: sent.providerMessageId }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
