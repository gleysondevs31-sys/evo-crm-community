function compact(text, max = 220) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function createAttoAiRuntime() {
  const usageLogs = [];

  function log(context, action, input, output) {
    usageLogs.push({
      id: `ai_log_${usageLogs.length + 1}`,
      companyId: context.companyId,
      userId: context.userId,
      leadId: context.leadId,
      module: context.module,
      action,
      inputPreview: compact(input, 120),
      outputPreview: compact(output, 120),
      provider: 'local-atto-runtime',
      model: 'atto-commercial-rules-v0',
      estimatedCostUsd: 0,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    suggestReply(context, conversation) {
      const output = `Sugestão ATTO AI: responda com tom consultivo, confirme o interesse e proponha o próximo passo. Contexto: ${compact(conversation)}`;
      log(context, 'suggest-reply', conversation, output);
      return output;
    },
    summarize(context, conversation) {
      const output = `Resumo ATTO AI: ${compact(conversation, 260) || 'sem histórico suficiente para resumir.'}`;
      log(context, 'summarize', conversation, output);
      return output;
    },
    classifyLead(context, lead) {
      const text = `${lead.name} ${lead.origin} ${lead.stage} ${(lead.tags || []).join(' ')}`.toLowerCase();
      const highIntent = ['agendado', 'proposta', 'alto-interesse', 'visitou'].some((term) => text.includes(term));
      const classification = {
        intent: highIntent ? 'alta' : 'média',
        score: highIntent ? 82 : 58,
        nextAction: highIntent ? 'Confirmar disponibilidade e avançar para proposta.' : 'Qualificar orçamento, região e prazo de compra.',
      };
      log(context, 'classify-lead', JSON.stringify(lead), JSON.stringify(classification));
      return classification;
    },
    generateCampaign(context, objective) {
      const output = {
        title: `Campanha: ${compact(objective, 60)}`,
        message: `Olá {{nome}}, aqui é da ATTO. Tenho uma oportunidade alinhada com seu interesse: ${compact(objective, 120)}. Posso te enviar os detalhes?`,
        cta: 'Responder interesse',
      };
      log(context, 'generate-campaign', objective, JSON.stringify(output));
      return output;
    },
    explainMetrics(context, metrics) {
      const output = `Insight ATTO AI: existem ${metrics.totalLeads} leads, ${metrics.wonLeads} vendas e conversão de ${metrics.conversionRate}%. Priorize leads em Conversando e Agendado.`;
      log(context, 'explain-metrics', JSON.stringify(metrics), output);
      return output;
    },
    usageLogs(companyId) {
      return usageLogs.filter((entry) => entry.companyId === companyId);
    },
  };
}

module.exports = { createAttoAiRuntime };
