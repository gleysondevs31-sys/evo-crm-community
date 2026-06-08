function createAdminModule({ database, queue }) {
  return {
    companies() {
      return database.listCompanies();
    },
    systemHealth() {
      return {
        status: 'operational',
        companies: database.db.companies.length,
        users: database.db.users.length,
        leads: database.db.leads.length,
        queuedJobs: queue.list().filter((job) => job.status === 'queued').length,
        completedJobs: queue.list().filter((job) => job.status === 'completed').length,
      };
    },
    audit(context, action, payload) {
      const entry = { id: database.createId('audit'), companyId: context.companyId, actorId: context.userId, action, payload, createdAt: database.now() };
      database.db.auditLogs ||= [];
      database.db.auditLogs.push(entry);
      return entry;
    },
  };
}

module.exports = { createAdminModule };
