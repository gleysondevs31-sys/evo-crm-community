function createReportsModule({ database, attoAi }) {
  function metrics(companyId) {
    const leads = database.listLeads(companyId);
    const totalLeads = leads.length;
    const wonLeads = leads.filter((lead) => lead.stage === 'Venda').length;
    const activeConversations = leads.filter((lead) => ['Conversando', 'Agendado', 'Visitou', 'Proposta'].includes(lead.stage)).length;
    const conversionRate = totalLeads ? Number(((wonLeads / totalLeads) * 100).toFixed(2)) : 0;
    return { totalLeads, wonLeads, activeConversations, conversionRate };
  }

  return {
    dashboard(context) {
      const data = metrics(context.companyId);
      return {
        ...data,
        connectionsOnline: database.listWhatsappConnections(context.companyId).filter((connection) => connection.status === 'connected').length,
        campaigns: database.listCampaigns(context.companyId).length,
        aiInsight: attoAi.explainMetrics({ ...context, module: 'reports' }, data),
      };
    },
  };
}

module.exports = { createReportsModule };
