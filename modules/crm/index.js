const PIPELINE_STAGES = ['Oferta Ativa', 'Conversando', 'Agendado', 'Visitou', 'Proposta', 'Venda', 'Perdido', 'Descartado'];

function createCrmModule({ database, attoAi }) {
  return {
    stages: PIPELINE_STAGES,
    listLeads(context) {
      return database.listLeads(context.companyId);
    },
    createLead(context, input) {
      const lead = database.createLead({
        companyId: context.companyId,
        assignedUserId: input.assignedUserId || context.userId,
        name: input.name,
        phone: input.phone,
        cpf: input.cpf,
        origin: input.origin,
        stage: input.stage,
        tags: input.tags,
      });
      const classification = attoAi.classifyLead({ ...context, module: 'crm', leadId: lead.id }, lead);
      lead.score = classification.score;
      lead.ai = classification;
      return lead;
    },
    moveLead(context, leadId, stage) {
      if (!PIPELINE_STAGES.includes(stage)) {
        throw new Error(`Invalid stage: ${stage}`);
      }
      return database.moveLead(context.companyId, leadId, stage);
    },
    addNote(context, leadId, note) {
      return database.addLeadNote(context.companyId, leadId, note);
    },
    summarizeLead(context, leadId) {
      const lead = database.getLead(context.companyId, leadId);
      if (!lead) return null;
      const events = database.listLeadEvents(context.companyId, leadId);
      const history = [lead.name, lead.stage, ...lead.notes.map((note) => note.body), ...events.map((event) => event.type)].join('\n');
      return attoAi.summarize({ ...context, module: 'crm', leadId }, history);
    },
    nextAction(context, leadId) {
      const lead = database.getLead(context.companyId, leadId);
      if (!lead) return null;
      return attoAi.classifyLead({ ...context, module: 'crm', leadId }, lead).nextAction;
    },
  };
}

module.exports = { createCrmModule, PIPELINE_STAGES };
