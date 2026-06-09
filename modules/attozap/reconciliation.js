async function reconcileAttozapDisparos({ database, context, eventBus } = {}) {
  if (!database || !context?.companyId) throw new Error('database e context.companyId são obrigatórios para reconciliação.');
  const companyId = context.companyId;
  const campaigns = await database.listCampaigns(companyId);
  const summary = { campaigns: 0, fixedContacts: 0, fixedCounters: 0, pendingAcks: 0, inconsistencies: 0 };
  for (const campaign of campaigns) {
    summary.campaigns += 1;
    const contacts = await database.listCampaignContacts(companyId, campaign.id);
    const jobs = await database.listMessageJobs(companyId, campaign.id);
    for (const job of jobs) {
      const contact = contacts.find((item) => item.contactId === job.contactId);
      if (!contact) continue;
      if (job.status === 'sent' && job.providerMessageId && !['sent', 'delivered', 'read', 'replied'].includes(contact.status)) {
        await database.updateCampaignContact(companyId, campaign.id, job.contactId, { status: 'sent', providerMessageId: job.providerMessageId });
        summary.fixedContacts += 1;
      }
      if (job.status === 'sent' && !job.deliveredAt && !job.readAt) summary.pendingAcks += 1;
      if (['delivered', 'read'].includes(job.status) && contact.status === 'sent') {
        await database.updateCampaignContact(companyId, campaign.id, job.contactId, { status: job.status, deliveredAt: job.deliveredAt || contact.deliveredAt, readAt: job.readAt || contact.readAt });
        summary.fixedContacts += 1;
      }
    }
    const fresh = await database.listCampaignContacts(companyId, campaign.id);
    const next = fresh.reduce((acc, item) => {
      acc.totalContacts += 1;
      if (['sent', 'delivered', 'read', 'replied'].includes(item.status)) acc.totalSent += 1;
      if (['delivered', 'read', 'replied'].includes(item.status)) acc.totalDelivered += 1;
      if (['failed', 'blocked'].includes(item.status)) acc.totalFailures += 1;
      if (['pending', 'queued', 'sending', 'retrying'].includes(item.status)) acc.totalPending += 1;
      return acc;
    }, { totalContacts: 0, totalSent: 0, totalDelivered: 0, totalFailures: 0, totalPending: 0 });
    if (['totalContacts', 'totalSent', 'totalDelivered', 'totalFailures', 'totalPending'].some((key) => campaign[key] !== next[key])) {
      await database.updateCampaign(companyId, campaign.id, next);
      summary.fixedCounters += 1;
    }
  }
  await database.createMessageLog({ companyId, type: 'reconciliation.completed', status: 'info', message: 'Reconciliação ATTOZAP executada.', metadata: summary });
  eventBus?.publish?.({ type: 'reconciliation.completed', companyId, payload: summary });
  return summary;
}

module.exports = { reconcileAttozapDisparos };
