#!/usr/bin/env node
const { createAttoFlowApp } = require('../apps/api/composition');

const required = ['DATABASE_URL', 'REDIS_URL', 'WHATSAPP_GATEWAY_URL', 'TEST_PHONE'];
const missing = required.filter((name) => !process.env[name]);
if (process.env.ATTO_BAILEYS_ENABLED !== 'true') missing.push('ATTO_BAILEYS_ENABLED=true');

if (missing.length) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'Variáveis reais ausentes para E2E ATTOZAP DISPAROS.', missing }, null, 2));
  process.exit(0);
}

async function main() {
  const app = createAttoFlowApp();
  const ctx = { companyId: app.config.defaultCompanyId, userId: app.config.defaultUserId, role: 'owner', can: () => true, correlationId: `e2e-${Date.now()}` };
  await app.queue.assertReady();
  const gateway = await app.gatewayClient.health();
  if (!gateway.ok || gateway.dryRun) throw new Error('Gateway real indisponível ou em dryRun.');
  const connections = await app.attozap.listConnections(ctx);
  const connection = connections.find((item) => item.status === 'connected');
  if (!connection) throw new Error('Nenhuma sessão connected. Escaneie o QR antes do E2E.');
  const list = await app.attozap.createContactList(ctx, { name: `E2E ${Date.now()}`, raw: `Teste;${process.env.TEST_PHONE}` });
  const campaign = await app.attozap.createCampaign(ctx, { name: `E2E ${Date.now()}`, connectionId: connection.id, contactListId: list.id, message: 'Teste operacional ATTOZAP {{nome}}' });
  const started = await app.attozap.startCampaign(ctx, campaign.id);
  const jobs = await app.database.listMessageJobs(ctx.companyId, campaign.id);
  const result = await app.attozap.processMessageJob(ctx, jobs[0].id);
  const metrics = await fetch(`${process.env.ATTO_API_BASE_URL || 'http://127.0.0.1:10000'}/metrics`).then((res) => res.text()).catch(() => 'metrics_unavailable');
  console.log(JSON.stringify({ ok: true, campaignId: started.id, messageJobId: result.id, providerMessageId: result.providerMessageId, metricsAvailable: metrics.includes('attozap_messages_sent_total') }, null, 2));
  await app.database.disconnect?.();
  await app.queue.close?.();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
