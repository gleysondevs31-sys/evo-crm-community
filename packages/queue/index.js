function createQueue() {
  const jobs = [];
  const handlers = new Map();

  return {
    add(type, payload, options = {}) {
      const job = {
        id: options.jobId || `job_${jobs.length + 1}`,
        type,
        payload,
        status: options.status || 'queued',
        attemptsMade: 0,
        maxAttempts: options.maxAttempts || 3,
        delayMs: options.delayMs || 0,
        scheduledAt: options.scheduledAt || new Date(Date.now() + (options.delayMs || 0)).toISOString(),
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
      const paused = jobs.filter((job) => job.status === 'queued' && match(job));
      paused.forEach((job) => {
        job.status = 'paused';
        job.updatedAt = new Date().toISOString();
      });
      return paused;
    },
    resume(match = () => true) {
      const resumed = jobs.filter((job) => job.status === 'paused' && match(job));
      resumed.forEach((job) => {
        job.status = 'queued';
        job.updatedAt = new Date().toISOString();
      });
      return resumed;
    },
    cancel(match = () => true) {
      const canceled = jobs.filter((job) => ['queued', 'paused', 'running'].includes(job.status) && match(job));
      canceled.forEach((job) => {
        job.status = 'canceled';
        job.updatedAt = new Date().toISOString();
      });
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
            job.scheduledAt = new Date(Date.now() + 30_000 * job.attemptsMade).toISOString();
          }
        }
        job.finishedAt = new Date().toISOString();
      }
      return queued;
    },
    list(filter = {}) {
      return jobs.filter((job) => (!filter.type || job.type === filter.type) && (!filter.campaignId || job.payload?.campaignId === filter.campaignId));
    },
  };
}

module.exports = { createQueue };
