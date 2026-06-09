const { createAttoFlowApp } = require('../api/composition');
const { logger } = require('../../packages/logger');

async function main() {
  const app = createAttoFlowApp({ registerQueueProcessors: false });
  const ctx = { companyId: app.config.defaultCompanyId, userId: app.config.defaultUserId, role: 'owner', can: () => true };

  app.queue.process(app.config.queueMessageSend, async ({ companyId, messageJobId, correlationId }) => {
    const jobContext = { ...ctx, companyId, correlationId: correlationId || `worker-${Date.now()}` };
    return app.attozap.processMessageJob(jobContext, messageJobId);
  });

  const health = await app.queue.health();
  if (!health.productionReady && app.config.attoEnv === 'production') {
    throw new Error(`ATTOZAP worker bloqueado: ${health.blockers.join(' ')}`);
  }

  if (app.queue.driver === 'bullmq') {
    await app.queue.assertReady();
    logger.info('ATTOZAP BullMQ worker started', { queue: app.config.queueMessageSend, concurrency: app.config.queueConcurrency, redis: health.redis });
    return;
  }

  const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 5000);
  async function tick() {
    const jobs = await app.queue.drain();
    if (jobs.length) logger.info('ATTO FLOW development worker drained jobs', { count: jobs.length });
  }
  setInterval(tick, intervalMs);
  await tick();
  logger.info('ATTO FLOW development memory worker started', { intervalMs });
}

main().catch((error) => {
  logger.error('ATTOZAP worker failed', { error });
  process.exit(1);
});
