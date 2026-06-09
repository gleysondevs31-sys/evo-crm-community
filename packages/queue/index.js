const { config } = require('../config');
const { createBullMqRuntime } = require('./bullmq-adapter');

function createQueue(settings = config) {
  const jobs = [];
  const handlers = new Map();
  const driver = settings.queueDriver === 'bullmq' ? 'bullmq' : 'memory';
  const bullmq = driver === 'bullmq'
    ? createBullMqRuntime({ redisUrl: settings.redisUrl, concurrency: settings.queueConcurrency, backoffMs: settings.queueBackoffMs }, handlers, jobs)
    : null;

  function mark(match, fromStatuses, status) {
    const selected = jobs.filter((job) => fromStatuses.includes(job.status) && match(job));
    selected.forEach((job) => {
      job.status = status;
      job.updatedAt = new Date().toISOString();
    });
    return selected;
  }

  return {
    driver,
    add(type, payload, options = {}) {
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
      if (bullmq) bullmq.then((runtime) => runtime.add(type, payload, job));
      return job;
    },
    process(type, handler) {
      handlers.set(type, handler);
      if (bullmq) bullmq.then((runtime) => runtime.process(type));
    },
    pause(match = () => true) {
      const paused = mark(match, ['queued'], 'paused');
      if (bullmq) bullmq.then((runtime) => Promise.all([...new Set(paused.map((job) => job.payload?.campaignId))].map((campaignId) => runtime.pauseCampaign(campaignId))));
      return paused;
    },
    resume(match = () => true) {
      const resumed = mark(match, ['paused'], 'queued');
      if (bullmq) bullmq.then((runtime) => Promise.all([...new Set(resumed.map((job) => job.payload?.campaignId))].map((campaignId) => runtime.resumeCampaign(campaignId))));
      return resumed;
    },
    cancel(match = () => true) {
      const canceled = mark(match, ['queued', 'paused', 'running'], 'canceled');
      if (bullmq) bullmq.then((runtime) => Promise.all([...new Set(canceled.map((job) => job.payload?.campaignId))].map((campaignId) => runtime.cancelCampaign(campaignId))));
      return canceled;
    },
    async drain(limit = 25) {
      const now = Date.now();
      const queued = jobs
        .filter((job) => job.status === 'queued' && new Date(job.scheduledAt).getTime() <= now)
        .slice(0, limit);
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
          if (job.status === 'queued') {
            job.scheduledAt = new Date(Date.now() + settings.queueBackoffMs * job.attemptsMade).toISOString();
          }
        }
        job.finishedAt = new Date().toISOString();
      }
      return queued;
    },
    list(filter = {}) {
      return jobs.filter((job) => (!filter.type || job.type === filter.type) && (!filter.campaignId || job.payload?.campaignId === filter.campaignId));
    },
    async metrics() {
      const memory = {
        driver,
        redis: driver === 'bullmq' ? 'configured' : 'not_used',
        workers: handlers.size,
        queued: jobs.filter((job) => job.status === 'queued').length,
        delayed: jobs.filter((job) => new Date(job.scheduledAt).getTime() > Date.now() && job.status === 'queued').length,
        running: jobs.filter((job) => job.status === 'running').length,
        failed: jobs.filter((job) => job.status === 'failed').length,
        completed: jobs.filter((job) => job.status === 'completed').length,
      };
      if (!bullmq) return memory;
      return { ...memory, bullmq: await (await bullmq).metrics() };
    },
  };
}

module.exports = { createQueue };
