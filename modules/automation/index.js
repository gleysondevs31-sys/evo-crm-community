function createAutomationModule({ database, queue, attoAi }) {
  return {
    triggerLeadEntered(context, leadId) {
      const lead = database.getLead(context.companyId, leadId);
      if (!lead) return null;
      const nextAction = attoAi.classifyLead({ ...context, module: 'automation', leadId }, lead).nextAction;
      const task = database.addTask({
        companyId: context.companyId,
        leadId,
        assignedUserId: lead.assignedUserId,
        title: `Follow-up automático: ${nextAction}`,
      });
      const job = queue.add('automation.followup', { companyId: context.companyId, leadId, taskId: task.id });
      return { task, job };
    },
    listTasks(context) {
      return database.listTasks(context.companyId);
    },
  };
}

module.exports = { createAutomationModule };
