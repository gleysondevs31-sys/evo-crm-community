const { createAttoFlowApp } = require('../api/composition');
const { logger } = require('../../packages/logger');

const app = createAttoFlowApp();

async function tick() {
  const jobs = await app.queue.drain();
  if (jobs.length) {
    logger.info('ATTO FLOW worker drained jobs', { count: jobs.length });
  }
}

const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 5000);
setInterval(tick, intervalMs);
tick();
logger.info('ATTO FLOW worker started', { intervalMs });
