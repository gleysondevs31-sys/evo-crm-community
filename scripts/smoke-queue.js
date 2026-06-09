const assert = require('node:assert/strict');
const { createQueue, validateQueueReadiness } = require('../packages/queue');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(predicate, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(250);
  }
  throw new Error('Timeout aguardando processamento BullMQ.');
}

async function main() {
  if (process.env.QUEUE_DRIVER === 'memory') throw new Error('smoke:queue exige QUEUE_DRIVER=bullmq e Redis real.');
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL obrigatório para smoke:queue.');

  const settings = {
    attoEnv: process.env.ATTO_ENV || 'development',
    queueDriver: 'bullmq',
    redisUrl: process.env.REDIS_URL,
    queueMessageSend: process.env.QUEUE_MESSAGE_SEND || `attozap.message.send.smoke.${Date.now()}`,
    queueConcurrency: Number(process.env.QUEUE_CONCURRENCY || 2),
    queueMaxAttempts: Number(process.env.QUEUE_MAX_ATTEMPTS || 3),
    queueBackoffMs: Number(process.env.QUEUE_BACKOFF_MS || 250),
  };

  const readiness = validateQueueReadiness(settings, { redisConnected: true });
  assert.equal(readiness.bullmqEnabled, true);
  const queue = createQueue(settings);
  await queue.assertReady();

  let attempts = 0;
  queue.process(settings.queueMessageSend, async (payload) => {
    attempts += 1;
    if (payload.failOnce && attempts === 1) throw new Error('falha planejada para validar retry/backoff');
    return { ok: true, payload };
  });

  const campaignId = 'campaign_queue_smoke';
  const contactId = 'contact_queue_smoke';
  const jobId = `send:company_queue_smoke:${campaignId}:${contactId}`;
  const first = await queue.add(settings.queueMessageSend, { companyId: 'company_queue_smoke', campaignId, contactId, connectionId: 'wa_queue_smoke', messageJobId: 'job_queue_smoke', failOnce: true }, { jobId, maxAttempts: 2 });
  const duplicate = await queue.add(settings.queueMessageSend, { companyId: 'company_queue_smoke', campaignId, contactId, connectionId: 'wa_queue_smoke', messageJobId: 'job_queue_smoke' }, { jobId, maxAttempts: 2 });
  assert.equal(first.id, duplicate.id);

  await waitFor(async () => {
    const metrics = await queue.metrics();
    return metrics.completed >= 1 || metrics.failed >= 1;
  });

  const cancelId = `send:company_queue_smoke:${campaignId}:cancel`;
  await queue.add(settings.queueMessageSend, { companyId: 'company_queue_smoke', campaignId, contactId: 'cancel', connectionId: 'wa_queue_smoke', messageJobId: 'job_cancel_smoke' }, { jobId: cancelId, delayMs: 60000 });
  const removed = await queue.cancelCampaign(campaignId);
  assert.equal(removed.some((job) => job.id === cancelId), true);

  const health = await queue.health();
  assert.equal(health.redisConnected, true);
  assert.equal(health.queueDriver, 'bullmq');
  await queue.close();
  console.log(JSON.stringify({ ok: true, queue: settings.queueMessageSend, attempts, health }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
