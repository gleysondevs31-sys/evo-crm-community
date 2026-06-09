function recoverAttozapDisparos({ database, queue, eventBus, context }) {
  const companyId = context.companyId;
  const recovered = { connections: 0, campaigns: 0, jobs: 0 };

  for (const connection of database.listWhatsappConnections(companyId)) {
    if (['connected', 'reconnecting'].includes(connection.status)) {
      database.updateWhatsappConnection(companyId, connection.id, { status: 'reconnecting', lastHeartbeatAt: new Date().toISOString() });
      recovered.connections += 1;
    }
  }

  for (const campaign of database.listCampaigns(companyId)) {
    if (campaign.status === 'running') {
      recovered.campaigns += 1;
      for (const job of database.listMessageJobs(companyId, campaign.id)) {
        if (['pending', 'queued', 'sending'].includes(job.status)) {
          const queueJobId = job.queueJobId || `send:${companyId}:${campaign.id}:${job.contactId}`;
          database.updateMessageJob(companyId, job.id, { status: 'pending', queueJobId });
          queue.add('attozap.message.send', {
            companyId,
            campaignId: campaign.id,
            contactId: job.contactId,
            connectionId: job.connectionId,
            messageJobId: job.id,
            renderedMessage: job.message,
            mediaUrl: job.mediaUrl,
            scheduledAt: job.scheduledAt,
          }, { jobId: queueJobId, scheduledAt: job.scheduledAt, maxAttempts: job.maxAttempts });
          recovered.jobs += 1;
        }
      }
    }
  }

  database.createMessageLog({ companyId, type: 'recovery.executed', status: 'info', message: JSON.stringify(recovered) });
  eventBus?.publish({ type: 'recovery.executed', companyId, payload: recovered });
  return recovered;
}

module.exports = { recoverAttozapDisparos };
