async function createBullMqRuntime(settings, handlers, mirrorJobs) {
  const { Queue, Worker, QueueEvents } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const connection = new IORedis(settings.redisUrl, { maxRetriesPerRequest: null });
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
    });
    workers.set(type, worker);
    return worker;
  }

  return {
    driver: 'bullmq',
    connection,
    async add(type, payload, options) {
      const queue = queueFor(type);
      ensureWorker(type);
      return queue.add(type, payload, {
        jobId: options.jobId,
        delay: Math.max(new Date(options.scheduledAt || 0).getTime() - Date.now(), options.delayMs || 0, 0),
        attempts: options.maxAttempts,
        backoff: { type: 'exponential', delay: settings.backoffMs },
        removeOnComplete: false,
        removeOnFail: false,
      });
    },
    process(type) {
      queueFor(type);
      ensureWorker(type);
    },
    async pauseCampaign(campaignId) {
      for (const queue of queues.values()) await queue.pause();
      return mirrorJobs.filter((job) => job.payload?.campaignId === campaignId);
    },
    async resumeCampaign(campaignId) {
      for (const queue of queues.values()) await queue.resume();
      return mirrorJobs.filter((job) => job.payload?.campaignId === campaignId);
    },
    async cancelCampaign(campaignId) {
      for (const queue of queues.values()) {
        const jobs = await queue.getJobs(['waiting', 'delayed', 'paused']);
        await Promise.all(jobs.filter((job) => job.data?.campaignId === campaignId).map((job) => job.remove()));
      }
      return mirrorJobs.filter((job) => job.payload?.campaignId === campaignId);
    },
    async metrics() {
      const byQueue = {};
      for (const [name, queue] of queues.entries()) {
        byQueue[name] = await queue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed', 'paused');
      }
      return { driver: 'bullmq', redis: 'configured', queues: byQueue, workers: workers.size };
    },
  };
}

module.exports = { createBullMqRuntime };
