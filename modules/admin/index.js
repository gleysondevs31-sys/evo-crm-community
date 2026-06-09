function createAdminModule({ database, queue }) {
  return {
    async companies() {
      return database.listCompanies();
    },
    async systemHealth(context = {}) {
      const companyId = context.companyId || process.env.ATTO_DEFAULT_COMPANY_ID || 'company_atto_demo';
      const stats = typeof database.stats === 'function'
        ? await database.stats(companyId)
        : { companies: database.db.companies.length, users: database.db.users.length, connections: database.db.whatsappConnections.length, campaigns: database.db.campaigns.length, jobs: database.db.messageJobs.length };
      const jobs = await queue.list();
      return {
        status: 'operational',
        ...stats,
        queuedJobs: jobs.filter((job) => job.status === 'queued').length,
        queueDepth: jobs.filter((job) => ['queued', 'paused', 'running'].includes(job.status)).length,
        completedJobs: jobs.filter((job) => job.status === 'completed').length,
      };
    },
    async audit(context, action, payload) {
      return database.createAuditLog({ companyId: context.companyId, actorId: context.userId, action, payload });
    },
  };
}

module.exports = { createAdminModule };
