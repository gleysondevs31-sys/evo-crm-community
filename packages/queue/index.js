const { config } = require('../config');
const { createBullMqRuntime } = require('./bullmq-adapter');

function resolveQueueDriver(settings = config) {
  return (settings.queueDriver || process.env.QUEUE_DRIVER || (process.env.NODE_ENV === 'test' ? 'memory' : 'bullmq')).toLowerCase();
}

function isProduction(settings = config) {
  return (settings.attoEnv || process.env.ATTO_ENV || process.env.NODE_ENV) === 'production';
}

function validateQueueReadiness(settings = config, runtimeState = {}) {
  const queueDriver = resolveQueueDriver(settings);
  const production = isProduction(settings);
  const blockers = [];
  const redisUrl = settings.redisUrl || process.env.REDIS_URL;
  if (production && queueDriver !== 'bullmq') blockers.push('QUEUE_DRIVER deve ser bullmq em production.');
  if (production && !redisUrl) blockers.push('REDIS_URL obrigatório em production.');
  if (production && runtimeState.redisConnected === false) blockers.push('Redis não conectou em production.');
  return {
    queueDriver,
    redisConnected: Boolean(runtimeState.redisConnected),
    bullmqEnabled: queueDriver === 'bullmq',
    workerMode: queueDriver === 'bullmq' ? 'bullmq-worker' : 'memory-drain',
    productionReady: blockers.length === 0 && (!production || (queueDriver === 'bullmq' && Boolean(redisUrl) && runtimeState.redisConnected !== false)),
    blockers,
  };
}

function assertQueueConfig(settings = config) {
  const readiness = validateQueueReadiness(settings);
  if (isProduction(settings) && readiness.blockers.length) {
    throw new Error(`Fila inválida para produção: ${readiness.blockers.join(' ')}`);
  }
}

function createMemoryRuntime(settings) {
  const jobs = [];
  const handlers = new Map();

  function mark(match, fromStatuses, status) {
    const selected = jobs.filter((job) => fromStatuses.includes(job.status) && match(job));
    selected.forEach((job) => {
      job.status = status;
      job.updatedAt = new Date().toISOString();
    });
    return selected;
  }

  return {
    driver: 'memory',
    workerMode: 'memory-drain',
    assertReady: async () => true,
    add(type, payload, options = {}) {
      if (payload?.campaignId && payload?.contactId && !options.jobId) throw new Error('jobId obrigatório para jobs de disparo.');
      const delayMs = Math.max(new Date(options.scheduledAt || 0).getTime() - Date.now(), options.delayMs || 0, 0);
      const job = {
        id: options.jobId || `job_${jobs.length + 1}`,
        type,
        payload,
        status: options.status || 'queued',
        attemptsMade: 0,
        maxAttempts: options.maxAttempts || settings.queueMaxAttempts || 3,
        delayMs,
        scheduledAt: options.scheduledAt || new Date(Date.now() + delayMs).toISOString(),
        createdAt: new Date().toISOString(),
      };
      const existing = jobs.find((entry) => entry.id === job.id);
      if (existing) return existing;
      jobs.push(job);
      return job;
    },
    process(type, handler) {
      handlers.set(type, handler);
    },
    pause(match = () => true) {
      return mark(match, ['queued'], 'paused');
    },
    resume(match = () => true) {
      return mark(match, ['paused'], 'queued');
    },
    cancel(match = () => true) {
      return mark(match, ['queued', 'paused', 'running'], 'canceled');
    },
    pauseCampaign(campaignId) {
      return this.pause((job) => job.payload?.campaignId === campaignId);
    },
    resumeCampaign(campaignId) {
      return this.resume((job) => job.payload?.campaignId === campaignId);
    },
    cancelCampaign(campaignId) {
      return this.cancel((job) => job.payload?.campaignId === campaignId);
    },
    async drain(limit = 25) {
      if (isProduction(settings)) throw new Error('queue.drain() é proibido em production. Use BullMQ Worker real.');
      const now = Date.now();
      const queued = jobs.filter((job) => job.status === 'queued' && new Date(job.scheduledAt).getTime() <= now).slice(0, limit);
      for (const job of queued) {
        const handler = handlers.get(job.type);
        if (!handler) continue;
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        job.attemptsMade += 1;
        try {
          job.result = await handler(job.payload, job);
          job.status = 'completed';
        } catch (error) {
          job.error = error.message;
          job.status = job.attemptsMade >= job.maxAttempts ? 'failed' : 'queued';
          if (job.status === 'queued') job.scheduledAt = new Date(Date.now() + settings.queueBackoffMs * job.attemptsMade).toISOString();
        }
        job.finishedAt = new Date().toISOString();
      }
      return queued;
    },
    list(filter = {}) {
      return jobs.filter((job) => (!filter.type || job.type === filter.type) && (!filter.campaignId || job.payload?.campaignId === filter.campaignId));
    },
    async metrics() {
      return {
        driver: 'memory',
        queueDriver: 'memory',
        redis: 'not_used',
        redisConnected: false,
        queueName: settings.queueMessageSend,
        waiting: jobs.filter((job) => job.status === 'queued' && new Date(job.scheduledAt).getTime() <= Date.now()).length,
        queued: jobs.filter((job) => job.status === 'queued').length,
        delayed: jobs.filter((job) => new Date(job.scheduledAt).getTime() > Date.now() && job.status === 'queued').length,
        active: jobs.filter((job) => job.status === 'running').length,
        running: jobs.filter((job) => job.status === 'running').length,
        failed: jobs.filter((job) => job.status === 'failed').length,
        completed: jobs.filter((job) => job.status === 'completed').length,
        paused: jobs.filter((job) => job.status === 'paused').length,
        workers: handlers.size,
        failedJobs: jobs.filter((job) => job.status === 'failed').slice(-10),
      };
    },
    async health() {
      const metrics = await this.metrics();
      return { ...metrics, ...validateQueueReadiness(settings, { redisConnected: false }) };
    },
    close: async () => {},
  };
}

function createQueue(settings = config) {
  const driver = resolveQueueDriver(settings);
  assertQueueConfig(settings);
  if (driver === 'memory' && isProduction(settings)) throw new Error('QUEUE_DRIVER=memory é proibido em production.');
  if (driver === 'memory') return createMemoryRuntime(settings);
  if (driver !== 'bullmq') throw new Error(`QUEUE_DRIVER inválido: ${driver}. Use bullmq ou memory.`);

  const handlers = new Map();
  let runtimePromise;
  function runtime() {
    if (!runtimePromise) {
      runtimePromise = createBullMqRuntime({ redisUrl: settings.redisUrl, concurrency: settings.queueConcurrency, backoffMs: settings.queueBackoffMs, maxAttempts: settings.queueMaxAttempts, queueName: settings.queueMessageSend }, handlers);
      if (isProduction(settings)) runtimePromise.catch((error) => { setImmediate(() => { throw error; }); });
    }
    return runtimePromise;
  }

  return {
    driver: 'bullmq',
    workerMode: 'bullmq-worker',
    async assertReady() { await (await runtime()).assertReady(); return true; },
    async add(type, payload, options = {}) {
      if (payload?.campaignId && payload?.contactId && !options.jobId) throw new Error('jobId obrigatório para jobs de disparo.');
      return (await runtime()).add(type, payload, options);
    },
    process(type, handler) {
      handlers.set(type, handler);
      runtime().then((rt) => rt.process(type)).catch(() => {});
    },
    async pause(match = () => true) { return (await this.list()).filter(match); },
    async resume(match = () => true) { return (await this.list()).filter(match); },
    async cancel(match = () => true) { return (await this.list()).filter(match); },
    async pauseCampaign(campaignId) { return (await runtime()).pauseCampaign(campaignId); },
    async resumeCampaign(campaignId) { return (await runtime()).resumeCampaign(campaignId); },
    async cancelCampaign(campaignId) { return (await runtime()).cancelCampaign(campaignId); },
    async drain() { throw new Error('queue.drain() não é worker real em BullMQ. Use apps/workers/worker.js.'); },
    async list(filter = {}) { return (await runtime()).list(filter); },
    async metrics() { return (await runtime()).metrics(); },
    async health() {
      try {
        return { ...(await (await runtime()).health()), ...validateQueueReadiness(settings, { redisConnected: true }) };
      } catch (error) {
        return { driver: 'bullmq', queueDriver: 'bullmq', redis: 'error', redisConnected: false, queueName: settings.queueMessageSend, productionReady: false, blockers: [error.message] };
      }
    },
    async close() { if (runtimePromise) await (await runtimePromise).close(); },
  };
}

module.exports = { createQueue, resolveQueueDriver, validateQueueReadiness };
