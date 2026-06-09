function createReportsModule({ database, attoAi }) {
  async function metrics(companyId) {
    const leads = await database.listLeads(companyId);
    const totalLeads = leads.length;
    const wonLeads = leads.filter((lead) => lead.stage === 'Venda').length;
    const activeConversations = leads.filter((lead) => ['Conversando', 'Agendado', 'Visitou', 'Proposta'].includes(lead.stage)).length;
    const conversionRate = totalLeads ? Number(((wonLeads / totalLeads) * 100).toFixed(2)) : 0;
    return { totalLeads, wonLeads, activeConversations, conversionRate };
  }

  return {
    async dashboard(context) {
      const data = await metrics(context.companyId);
      const [connections, campaigns] = await Promise.all([
        database.listWhatsappConnections(context.companyId),
        database.listCampaigns(context.companyId),
      ]);
      return {
        ...data,
        connectionsOnline: connections.filter((connection) => connection.status === 'connected').length,
        campaigns: campaigns.length,
        aiInsight: attoAi.explainMetrics({ ...context, module: 'reports' }, data),
      };
    },
  };
}

module.exports = { createReportsModule };
