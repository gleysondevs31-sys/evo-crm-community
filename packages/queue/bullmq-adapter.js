async function loadBullMq() {
  const { Queue, Worker, QueueEvents } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  return { Queue, Worker, QueueEvents, IORedis };
}

function normalizeBullJob(job, type) {
  if (!job) return null;
  return {
    id: job.id,
    type: type || job.name,
    payload: job.data,
    status: job.finishedOn ? 'completed' : job.failedReason ? 'failed' : 'queued',
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts?.attempts,
    scheduledAt: job.timestamp ? new Date(job.timestamp + (job.opts?.delay || 0)).toISOString() : undefined,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : undefined,
    failedReason: job.failedReason,
  };
}

async function createBullMqRuntime(settings, handlers) {
  const { Queue, Worker, QueueEvents, IORedis } = await loadBullMq();
  const connection = new IORedis(settings.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  await connection.connect();
  await connection.ping();

  const queues = new Map();
  const workers = new Map();
  const events = new Map();

  function queueFor(type) {
    if (!queues.has(type)) {
      queues.set(type, new Queue(type, { connection }));
      events.set(type, new QueueEvents(type, { connection }));
    }
    return queues.get(type);
  }

  function ensureWorker(type) {
    const handler = handlers.get(type);
    if (!handler || workers.has(type)) return null;
    const worker = new Worker(type, async (job) => handler(job.data, job), {
      connection,
      concurrency: settings.concurrency,
      autorun: true,
    });
    workers.set(type, worker);
    return worker;
  }

  async function jobsForCampaign(campaignId, states = ['waiting', 'delayed', 'paused', 'active']) {
    const result = [];
    for (const [type, queue] of queues.entries()) {
      const jobs = await queue.getJobs(states);
      result.push(...jobs.filter((job) => job.data?.campaignId === campaignId).map((job) => normalizeBullJob(job, type)));
    }
    return result;
  }

  return {
    driver: 'bullmq',
    workerMode: 'bullmq-worker',
    connection,
    async assertReady() {
      await connection.ping();
      return true;
    },
    async add(type, payload, options = {}) {
      const queue = queueFor(type);
      ensureWorker(type);
      const delay = Math.max(new Date(options.scheduledAt || 0).getTime() - Date.now(), options.delayMs || 0, 0);
      const job = await queue.add(type, payload, {
        jobId: options.jobId,
        delay,
        attempts: options.maxAttempts || settings.maxAttempts,
        backoff: { type: 'exponential', delay: settings.backoffMs },
        removeOnComplete: false,
        removeOnFail: false,
      });
      return normalizeBullJob(job, type);
    },
    process(type) {
      queueFor(type);
      ensureWorker(type);
    },
    async pauseCampaign(campaignId) {
      return jobsForCampaign(campaignId);
    },
    async resumeCampaign(campaignId) {
      return jobsForCampaign(campaignId);
    },
    async cancelCampaign(campaignId) {
      const removed = [];
      for (const [type, queue] of queues.entries()) {
        const jobs = await queue.getJobs(['waiting', 'delayed', 'paused']);
        for (const job of jobs.filter((entry) => entry.data?.campaignId === campaignId)) {
          removed.push(normalizeBullJob(job, type));
          await job.remove();
        }
      }
      return removed;
    },
    async list(filter = {}) {
      const states = ['waiting', 'delayed', 'active', 'completed', 'failed', 'paused'];
      const rows = [];
      for (const [type, queue] of queues.entries()) {
        if (filter.type && filter.type !== type) continue;
        const jobs = await queue.getJobs(states, 0, 100, false);
        rows.push(...jobs.map((job) => normalizeBullJob(job, type)));
      }
      return rows.filter((job) => !filter.campaignId || job.payload?.campaignId === filter.campaignId);
    },
    async metrics() {
      const byQueue = {};
      const failedJobs = [];
      let waiting = 0;
      let delayed = 0;
      let active = 0;
      let completed = 0;
      let failed = 0;
      let paused = 0;
      for (const [name, queue] of queues.entries()) {
        const counts = await queue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed', 'paused');
        byQueue[name] = counts;
        waiting += counts.waiting || 0;
        delayed += counts.delayed || 0;
        active += counts.active || 0;
        completed += counts.completed || 0;
        failed += counts.failed || 0;
        paused += counts.paused || 0;
        const recentFailed = await queue.getFailed(0, 10);
        failedJobs.push(...recentFailed.map((job) => ({ id: job.id, queue: name, failedReason: job.failedReason, payload: job.data })));
      }
      return { driver: 'bullmq', queueDriver: 'bullmq', redis: 'connected', redisConnected: true, queueName: settings.queueName, waiting, delayed, active, completed, failed, paused, workers: workers.size, failedJobs, queues: byQueue };
    },
    async health() {
      try {
        await connection.ping();
        const metrics = await this.metrics();
        return { ...metrics, productionReady: true, blockers: [] };
      } catch (error) {
        return { driver: 'bullmq', queueDriver: 'bullmq', redis: 'error', redisConnected: false, productionReady: false, blockers: [error.message] };
      }
    },
    async close() {
      await Promise.all([...workers.values()].map((worker) => worker.close()));
      await Promise.all([...events.values()].map((event) => event.close()));
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      await connection.quit();
    },
  };
}

module.exports = { createBullMqRuntime, loadBullMq };
