function createAttoZapModule({ database, attoAi, queue }) {
  return {
    listConnections(context) {
      return database.listWhatsappConnections(context.companyId);
    },
    createConnection(context, input) {
      return database.createWhatsappConnection({ companyId: context.companyId, name: input.name, phoneNumber: input.phoneNumber });
    },
    inbox(context) {
      return database.listLeads(context.companyId).map((lead) => ({
        leadId: lead.id,
        leadName: lead.name,
        phone: lead.phone,
        stage: lead.stage,
        lastInteractionAt: lead.lastInteractionAt,
        preview: lead.notes[lead.notes.length - 1]?.body || 'Sem mensagens recentes',
      }));
    },
    suggestReply(context, leadId) {
      const lead = database.getLead(context.companyId, leadId);
      if (!lead) return null;
      const conversation = [lead.name, lead.stage, ...lead.notes.map((note) => note.body)].join('\n');
      return attoAi.suggestReply({ ...context, module: 'attozap', leadId }, conversation);
    },
    createCampaign(context, input) {
      const generated = input.message ? null : attoAi.generateCampaign({ ...context, module: 'attozap' }, input.objective || input.name);
      const campaign = database.createCampaign({
        companyId: context.companyId,
        name: input.name || generated.title,
        message: input.message || generated.message,
        filters: input.filters,
      });
      queue.add('campaign.dispatch', { companyId: context.companyId, campaignId: campaign.id });
      return { ...campaign, generated };
    },
  };
}

module.exports = { createAttoZapModule };
