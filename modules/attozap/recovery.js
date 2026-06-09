async function recoverAttozapDisparos({ database, queue, eventBus, context }) {
  const companyId = context.companyId;
  const recovered = { connections: 0, campaigns: 0, jobs: 0 };

  await database.transaction(async (tx) => {
    for (const connection of await tx.listWhatsappConnections(companyId)) {
      if (['connected', 'reconnecting'].includes(connection.status)) {
        await tx.updateWhatsappConnection(companyId, connection.id, { status: 'reconnecting', lastHeartbeatAt: new Date().toISOString() });
        recovered.connections += 1;
      }
    }

    for (const campaign of await tx.listCampaigns(companyId)) {
      if (campaign.status === 'running') {
        recovered.campaigns += 1;
        for (const job of await tx.listMessageJobs(companyId, campaign.id)) {
          if (['pending', 'queued', 'sending'].includes(job.status)) {
            const queueJobId = job.queueJobId || `send:${companyId}:${campaign.id}:${job.contactId}`;
            await tx.updateMessageJob(companyId, job.id, { status: 'pending', queueJobId });
            await queue.add('attozap.message.send', {
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

    await tx.createMessageLog({ companyId, type: 'recovery.executed', status: 'info', message: JSON.stringify(recovered), metadata: recovered });
  });
  eventBus?.publish({ type: 'recovery.executed', companyId, payload: recovered });
  return recovered;
}

module.exports = { recoverAttozapDisparos };
