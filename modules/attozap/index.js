const CONNECTION_STATUSES = ['pending', 'qr_required', 'connected', 'disconnected', 'reconnecting', 'blocked', 'error'];
const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'running', 'paused', 'completed', 'canceled', 'failed'];
const CONTACT_STATUSES = ['valid', 'invalid', 'duplicate', 'blocked'];

const BRAZILIAN_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '24', '27', '28', '31', '32', '33', '34', '35', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48', '49', '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', '68', '69', '71', '73', '74', '75', '77', '79', '81', '82', '83', '84', '85', '86', '87', '88', '89', '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

function assertAllowed(context, action) {
  if (!context.can('manager')) {
    throw new Error(`Sem permissão para ${action}. É necessário perfil gerente ou superior.`);
  }
}

function normalizeBrazilianPhone(value) {
  const raw = String(value || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits.startsWith('55')) digits = `55${digits}`;
  const local = digits.slice(2);
  const ddd = local.slice(0, 2);
  const isValidLength = local.length === 10 || local.length === 11;
  const valid = digits.startsWith('55') && isValidLength && BRAZILIAN_DDDS.has(ddd);
  return {
    raw,
    phone: digits,
    valid,
    error: valid ? null : 'Telefone brasileiro inválido: informe DDI 55, DDD válido e 10/11 dígitos locais.',
  };
}

function parseManualContacts(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, phone, tags = '', custom = ''] = line.split(/[;,]/).map((part) => part.trim());
      return {
        name: name || phone,
        phone: phone || name,
        tags: tags ? tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
        customFields: custom ? { observacao: custom } : {},
      };
    });
}

function pickSpintaxOption(options) {
  const parts = options.split('|').map((part) => part.trim()).filter(Boolean);
  return parts[0] || '';
}

function applySpintax(message) {
  return String(message || '').replace(/\{([^{}]+\|[^{}]+)\}/g, (_, options) => pickSpintaxOption(options));
}

function renderTemplate(message, variables) {
  const withVariables = String(message || '').replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => {
    const value = variables[key] ?? variables.customFields?.[key] ?? '';
    return String(value);
  });
  return applySpintax(withVariables);
}

function randomDelay(min, max) {
  const safeMin = Number(min || 0);
  const safeMax = Math.max(Number(max || safeMin), safeMin);
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

function summarizeCampaign(database, companyId, campaignId) {
  const contacts = database.listCampaignContacts(companyId, campaignId);
  const stats = contacts.reduce((acc, item) => {
    acc.totalContacts += 1;
    if (item.status === 'sent') acc.totalSent += 1;
    if (item.status === 'delivered') acc.totalDelivered += 1;
    if (item.status === 'failed') acc.totalFailures += 1;
    if (['pending', 'queued'].includes(item.status)) acc.totalPending += 1;
    return acc;
  }, { totalContacts: 0, totalSent: 0, totalDelivered: 0, totalFailures: 0, totalPending: 0 });
  return database.updateCampaign(companyId, campaignId, stats);
}

function createAttoZapModule({ database, queue, eventBus, config = {} }) {
  function emit(context, type, payload = {}) {
    return eventBus?.publish({ type, companyId: context.companyId, connectionId: payload.connectionId, campaignId: payload.campaignId, payload });
  }

  function log(context, input) {
    const entry = database.createMessageLog({ companyId: context.companyId, ...input });
    emit(context, input.type, { ...input, logId: entry.id });
    return entry;
  }

  function ensureCompanyCanSend(context) {
    const company = database.getCompany(context.companyId);
    if (!company || company.status === 'blocked') throw new Error('Empresa bloqueada ou inexistente. Disparos suspensos.');
  }

  function ensureConnectionReady(context, connectionId) {
    const connection = database.getWhatsappConnection(context.companyId, connectionId);
    if (!connection) throw new Error('Conexão WhatsApp não encontrada.');
    if (connection.status !== 'connected') throw new Error('Conexão WhatsApp não está conectada.');
    if (connection.sentToday >= connection.dailyLimit) throw new Error('Limite diário da conexão atingido.');
    if (connection.sentThisHour >= connection.hourlyLimit) throw new Error('Limite por hora da conexão atingido.');
    return connection;
  }

  function enqueueCampaignMessages(context, campaign) {
    const contacts = database.listCampaignContacts(context.companyId, campaign.id);
    const connection = database.getWhatsappConnection(context.companyId, campaign.connectionId);
    let offset = 0;
    const jobs = [];
    for (const item of contacts) {
      const contact = database.getContact(context.companyId, item.contactId);
      if (!contact || contact.status !== 'valid') {
        database.updateCampaignContact(context.companyId, campaign.id, item.contactId, { status: 'failed' });
        log(context, { type: 'message.invalid_contact', campaignId: campaign.id, connectionId: campaign.connectionId, contactId: item.contactId, status: 'failed', error: 'Contato inválido ou inexistente.' });
        continue;
      }
      const rendered = renderTemplate(campaign.message, {
        nome: contact.name,
        telefone: contact.phone,
        empresa: database.getCompany(context.companyId)?.name || '',
        customFields: contact.customFields,
        ...contact.customFields,
      });
      const delayMs = randomDelay(connection.delayMinMs, connection.delayMaxMs);
      offset += delayMs;
      const queueJobId = `send:${context.companyId}:${campaign.id}:${contact.id}`;
      const messageJob = database.createMessageJob({
        companyId: context.companyId,
        campaignId: campaign.id,
        contactId: contact.id,
        connectionId: connection.id,
        message: rendered,
        mediaUrl: campaign.mediaUrl,
        scheduledAt: new Date(Date.now() + offset).toISOString(),
        idempotencyKey: queueJobId,
        queueJobId,
      });
      if (messageJob.status === 'sent') continue;
      database.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'queued' });
      jobs.push(queue.add(config.queueMessageSend || 'attozap.message.send', {
        companyId: context.companyId,
        campaignId: campaign.id,
        contactId: contact.id,
        connectionId: connection.id,
        messageJobId: messageJob.id,
        renderedMessage: rendered,
        mediaUrl: campaign.mediaUrl,
        attempt: messageJob.attempt,
        scheduledAt: messageJob.scheduledAt,
      }, { jobId: queueJobId, delayMs: offset, scheduledAt: messageJob.scheduledAt, maxAttempts: messageJob.maxAttempts }));
    }
    summarizeCampaign(database, context.companyId, campaign.id);
    return jobs;
  }

  return {
    CONNECTION_STATUSES,
    CAMPAIGN_STATUSES,
    CONTACT_STATUSES,
    normalizeBrazilianPhone,
    renderTemplate,
    parseManualContacts,

    inbox(context) {
      return database.listContacts(context.companyId).slice(0, 25).map((contact) => ({
        leadId: contact.id,
        leadName: contact.name,
        phone: contact.phone,
        stage: contact.status,
        lastInteractionAt: contact.updatedAt,
        preview: `Contato ${contact.status} para disparos`,
      }));
    },
    suggestReply(context, leadId) {
      const contact = database.getContact(context.companyId, leadId) || database.getLead(context.companyId, leadId);
      if (!contact) return null;
      return `Sugestão ATTOZAP DISPAROS: confirme opt-in, personalize com o nome ${contact.name} e respeite limites da conexão antes do envio.`;
    },

    listConnections(context) {
      return database.listWhatsappConnections(context.companyId);
    },
    createConnection(context, input) {
      assertAllowed(context, 'criar conexão');
      const normalized = normalizeBrazilianPhone(input.phoneNumber || input.number);
      const connection = database.createWhatsappConnection({
        companyId: context.companyId,
        name: input.name,
        phoneNumber: normalized.phone,
        status: normalized.valid ? 'qr_required' : 'error',
        dailyLimit: input.dailyLimit,
        hourlyLimit: input.hourlyLimit,
        delayMinMs: input.delayMinMs,
        delayMaxMs: input.delayMaxMs,
      });
      log(context, { type: 'connection.qr_generated', connectionId: connection.id, status: connection.status, message: connection.qrCode, error: normalized.error });
      emit(context, 'qr.generated', { connectionId: connection.id, qrCode: connection.qrCode });
      return connection;
    },
    updateConnectionStatus(context, connectionId, status) {
      assertAllowed(context, 'alterar conexão');
      if (!CONNECTION_STATUSES.includes(status)) throw new Error(`Status inválido: ${status}`);
      const patch = { status, lastHeartbeatAt: new Date().toISOString() };
      if (status === 'connected') patch.connectedAt = patch.lastHeartbeatAt;
      const connection = database.updateWhatsappConnection(context.companyId, connectionId, patch);
      if (!connection) throw new Error('Conexão não encontrada.');
      log(context, { type: `connection.${status}`, connectionId, status: 'info', message: `Conexão ${status}` });
      emit(context, 'connection.status_changed', { connectionId, status });
      return connection;
    },

    listContactLists(context) {
      return database.listContactLists(context.companyId).map((list) => ({ ...list, contacts: database.listContacts(context.companyId, list.id).slice(0, 5) }));
    },
    createContactList(context, input) {
      assertAllowed(context, 'criar lista');
      const list = database.createContactList({ companyId: context.companyId, name: input.name, source: input.source || 'manual' });
      const rawContacts = Array.isArray(input.contacts) ? input.contacts : parseManualContacts(input.raw || input.text || '');
      const seen = new Set();
      for (const rawContact of rawContacts) {
        const normalized = normalizeBrazilianPhone(rawContact.phone || rawContact.telefone);
        const duplicate = seen.has(normalized.phone) || database.listContacts(context.companyId, list.id).some((contact) => contact.phone === normalized.phone);
        seen.add(normalized.phone);
        database.createContact({
          companyId: context.companyId,
          listId: list.id,
          name: rawContact.name || rawContact.nome || normalized.phone,
          phone: normalized.phone,
          rawPhone: normalized.raw,
          tags: rawContact.tags || [],
          customFields: rawContact.customFields || rawContact.campos || {},
          origin: input.source || 'manual',
          status: !normalized.valid ? 'invalid' : duplicate ? 'duplicate' : 'valid',
          validationError: normalized.error,
        });
      }
      log(context, { type: 'contacts.imported', status: 'info', message: `Lista ${list.name} importada.` });
      return database.updateContactListStats(context.companyId, list.id);
    },
    listContacts(context, listId) {
      return database.listContacts(context.companyId, listId);
    },

    listTemplates(context) {
      return database.listMessageTemplates(context.companyId);
    },
    createTemplate(context, input) {
      assertAllowed(context, 'criar template');
      const template = database.createMessageTemplate({ companyId: context.companyId, name: input.name, body: input.body, mediaUrl: input.mediaUrl, variables: input.variables });
      log(context, { type: 'template.created', status: 'info', message: template.name });
      return template;
    },
    previewMessage(context, input) {
      const company = database.getCompany(context.companyId);
      const contact = input.contactId ? database.getContact(context.companyId, input.contactId) : null;
      const fakeContact = contact || { name: input.name || 'Maria Silva', phone: input.phone || '5511999990000', customFields: input.customFields || { interesse: 'imóvel' } };
      const rendered = renderTemplate(input.message || input.body, {
        nome: fakeContact.name,
        telefone: fakeContact.phone,
        empresa: company?.name || '',
        customFields: fakeContact.customFields,
        ...fakeContact.customFields,
      });
      return { rendered, length: rendered.length, valid: rendered.trim().length > 0 };
    },

    listCampaigns(context) {
      return database.listCampaigns(context.companyId).map((campaign) => summarizeCampaign(database, context.companyId, campaign.id));
    },
    getCampaign(context, campaignId) {
      const campaign = summarizeCampaign(database, context.companyId, campaignId);
      if (!campaign) return null;
      return {
        ...campaign,
        connection: database.getWhatsappConnection(context.companyId, campaign.connectionId),
        contactList: database.getContactList(context.companyId, campaign.contactListId),
        jobs: database.listMessageJobs(context.companyId, campaign.id),
      };
    },
    createCampaign(context, input) {
      assertAllowed(context, 'criar campanha');
      const contacts = database.listContacts(context.companyId, input.contactListId).filter((contact) => contact.status === 'valid');
      const campaign = database.createCampaign({
        companyId: context.companyId,
        name: input.name,
        connectionId: input.connectionId,
        contactListId: input.contactListId,
        message: input.message,
        mediaUrl: input.mediaUrl,
        scheduledAt: input.scheduledAt,
        totalContacts: contacts.length,
        totalPending: contacts.length,
      });
      contacts.forEach((contact) => database.addCampaignContact({ companyId: context.companyId, campaignId: campaign.id, contactId: contact.id }));
      log(context, { type: 'campaign.created', campaignId: campaign.id, connectionId: campaign.connectionId, status: 'info', message: campaign.name });
      return campaign;
    },
    updateCampaign(context, campaignId, input) {
      assertAllowed(context, 'editar campanha');
      const campaign = database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      if (campaign.status !== 'draft') throw new Error('Só é permitido editar campanhas em draft.');
      return database.updateCampaign(context.companyId, campaignId, input);
    },
    startCampaign(context, campaignId) {
      assertAllowed(context, 'iniciar campanha');
      ensureCompanyCanSend(context);
      const campaign = database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) throw new Error(`Campanha não pode iniciar a partir do status ${campaign.status}.`);
      ensureConnectionReady(context, campaign.connectionId);
      database.updateCampaign(context.companyId, campaignId, { status: 'running', startedAt: campaign.startedAt || new Date().toISOString(), finishedAt: null });
      const updated = database.getCampaign(context.companyId, campaignId);
      const jobs = enqueueCampaignMessages(context, updated);
      log(context, { type: 'campaign.started', campaignId, connectionId: campaign.connectionId, status: 'running', message: `${jobs.length} mensagens enfileiradas.` });
      emit(context, 'campaign.progress', { campaignId, queued: jobs.length });
      return this.getCampaign(context, campaignId);
    },
    pauseCampaign(context, campaignId) {
      assertAllowed(context, 'pausar campanha');
      const campaign = database.updateCampaign(context.companyId, campaignId, { status: 'paused' });
      queue.pause((job) => job.payload?.campaignId === campaignId);
      log(context, { type: 'campaign.paused', campaignId, connectionId: campaign?.connectionId, status: 'paused' });
      return campaign;
    },
    resumeCampaign(context, campaignId) {
      assertAllowed(context, 'retomar campanha');
      const campaign = database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      ensureConnectionReady(context, campaign.connectionId);
      database.updateCampaign(context.companyId, campaignId, { status: 'running' });
      queue.resume((job) => job.payload?.campaignId === campaignId);
      log(context, { type: 'campaign.resumed', campaignId, connectionId: campaign.connectionId, status: 'running' });
      return this.getCampaign(context, campaignId);
    },
    cancelCampaign(context, campaignId) {
      assertAllowed(context, 'cancelar campanha');
      const campaign = database.updateCampaign(context.companyId, campaignId, { status: 'canceled', finishedAt: new Date().toISOString() });
      queue.cancel((job) => job.payload?.campaignId === campaignId);
      database.listCampaignContacts(context.companyId, campaignId).forEach((item) => {
        if (['pending', 'queued'].includes(item.status)) database.updateCampaignContact(context.companyId, campaignId, item.contactId, { status: 'canceled' });
      });
      log(context, { type: 'campaign.canceled', campaignId, connectionId: campaign?.connectionId, status: 'canceled' });
      return campaign;
    },
    deleteCampaign(context, campaignId) {
      assertAllowed(context, 'excluir campanha');
      const campaign = database.getCampaign(context.companyId, campaignId);
      if (!campaign) return false;
      if (!['draft', 'canceled', 'failed', 'completed'].includes(campaign.status)) throw new Error('Campanha em execução não pode ser excluída.');
      const deleted = database.deleteCampaign(context.companyId, campaignId);
      log(context, { type: 'campaign.deleted', campaignId, status: 'info' });
      return deleted;
    },
    duplicateCampaign(context, campaignId) {
      assertAllowed(context, 'duplicar campanha');
      const campaign = database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      return this.createCampaign(context, { ...campaign, name: `${campaign.name} (cópia)` });
    },
    listLogs(context, filters = {}) {
      return database.listMessageLogs(context.companyId, filters);
    },
    processMessageJob(context, messageJobId) {
      const job = database.getMessageJob(context.companyId, messageJobId);
      if (!job || job.status === 'sent') return job;
      const campaign = database.getCampaign(context.companyId, job.campaignId);
      const contact = database.getContact(context.companyId, job.contactId);
      if (!campaign || campaign.status !== 'running') throw new Error('Campanha não está ativa.');
      if (!contact || contact.status !== 'valid') throw new Error('Contato inválido.');
      const connection = ensureConnectionReady(context, job.connectionId);
      database.updateMessageJob(context.companyId, messageJobId, { status: 'sending', attempt: job.attempt + 1, startedAt: new Date().toISOString() });
      database.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'sending' });
      log(context, { type: 'job.started', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, status: 'sending' });

      const providerMessageId = `local:${connection.id}:${messageJobId}:${Date.now()}`;
      database.updateMessageJob(context.companyId, messageJobId, { status: 'sent', providerMessageId, sentAt: new Date().toISOString() });
      database.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'sent', providerMessageId });
      database.updateWhatsappConnection(context.companyId, connection.id, { messagesSent: connection.messagesSent + 1, sentToday: connection.sentToday + 1, sentThisHour: connection.sentThisHour + 1, lastHeartbeatAt: new Date().toISOString() });
      log(context, { type: 'message.sent', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, message: job.message, status: 'sent' });
      const updated = summarizeCampaign(database, context.companyId, campaign.id);
      if (updated.totalPending === 0 && updated.totalFailures === 0) {
        database.updateCampaign(context.companyId, campaign.id, { status: 'completed', finishedAt: new Date().toISOString() });
        log(context, { type: 'campaign.completed', campaignId: campaign.id, connectionId: connection.id, status: 'completed' });
        emit(context, 'campaign.completed', { campaignId: campaign.id });
      }
      return database.getMessageJob(context.companyId, messageJobId);
    },
  };
}

module.exports = { createAttoZapModule, normalizeBrazilianPhone, renderTemplate, parseManualContacts, CONNECTION_STATUSES, CAMPAIGN_STATUSES, CONTACT_STATUSES };
