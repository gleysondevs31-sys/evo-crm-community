function createQueue() {
  const jobs = [];
  const handlers = new Map();

  return {
    add(type, payload) {
      const job = { id: `job_${jobs.length + 1}`, type, payload, status: 'queued', createdAt: new Date().toISOString() };
      jobs.push(job);
      return job;
    },
    process(type, handler) {
      handlers.set(type, handler);
    },
    async drain(limit = 25) {
      const queued = jobs.filter((job) => job.status === 'queued').slice(0, limit);
      for (const job of queued) {
        const handler = handlers.get(job.type);
        if (!handler) continue;
        job.status = 'running';
        try {
          job.result = await handler(job.payload, job);
          job.status = 'completed';
        } catch (error) {
          job.error = error.message;
          job.status = 'failed';
        }
        job.finishedAt = new Date().toISOString();
      }
      return queued;
    },
    list() {
      return jobs;
    },
  };
}

module.exports = { createQueue };
