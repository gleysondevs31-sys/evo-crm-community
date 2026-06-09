const { classifyDeliveryError, CATEGORIES } = require('./errors/error-classifier');
const { applyHealthEvent, adaptiveLimits } = require('./operations');

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
  return { raw, phone: digits, valid, error: valid ? null : 'Telefone brasileiro inválido: informe DDI 55, DDD válido e 10/11 dígitos locais.' };
}

function parseManualContacts(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, phone, tags = '', custom = ''] = line.split(/[;,]/).map((part) => part.trim());
      return { name: name || phone, phone: phone || name, tags: tags ? tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [], customFields: custom ? { observacao: custom } : {} };
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
  const withVariables = String(message || '').replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => String(variables[key] ?? variables.customFields?.[key] ?? ''));
  return applySpintax(withVariables);
}

function ackToStatus(ackStatus) {
  const value = String(ackStatus || '').toLowerCase();
  if (['read', 'played', '4', '5'].includes(value)) return 'read';
  if (['delivered', 'server_ack', 'delivery', '3'].includes(value)) return 'delivered';
  return 'sent';
}

function randomDelay(min, max) {
  const safeMin = Number(min || 0);
  const safeMax = Math.max(Number(max || safeMin), safeMin);
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

async function summarizeCampaign(database, companyId, campaignId) {
  const contacts = await database.listCampaignContacts(companyId, campaignId);
  const stats = contacts.reduce((acc, item) => {
    acc.totalContacts += 1;
    if (['sent', 'delivered', 'read', 'replied'].includes(item.status)) acc.totalSent += 1;
    if (['delivered', 'read', 'replied'].includes(item.status)) acc.totalDelivered += 1;
    if (['failed', 'blocked'].includes(item.status)) acc.totalFailures += 1;
    if (['pending', 'queued', 'sending', 'retrying'].includes(item.status)) acc.totalPending += 1;
    return acc;
  }, { totalContacts: 0, totalSent: 0, totalDelivered: 0, totalFailures: 0, totalPending: 0 });
  return database.updateCampaign(companyId, campaignId, stats);
}

function createAttoZapModule({ database, queue, eventBus, config = {}, gatewayClient = null }) {
  function emit(context, type, payload = {}) {
    return eventBus?.publish({ type, companyId: context.companyId, connectionId: payload.connectionId, campaignId: payload.campaignId, payload });
  }

  async function log(context, input) {
    const entry = await database.createMessageLog({ companyId: context.companyId, ...input });
    emit(context, input.type, { ...input, logId: entry.id });
    return entry;
  }

  async function ensureCompanyCanSend(context) {
    const company = await database.getCompany(context.companyId);
    if (!company || company.status === 'blocked') throw new Error('Empresa bloqueada ou inexistente. Disparos suspensos.');
  }

  async function ensureConnectionReady(context, connectionId) {
    const connection = await database.getWhatsappConnection(context.companyId, connectionId);
    if (!connection) throw new Error('Conexão WhatsApp não encontrada.');
    if (connection.status !== 'connected') throw new Error('Conexão WhatsApp não está conectada.');
    const limits = adaptiveLimits(connection);
    if (limits.blocked) throw new Error('Conexão WhatsApp bloqueada por healthScore crítico.');
    if (connection.sentToday >= connection.dailyLimit) throw new Error('Limite diário da conexão atingido.');
    if (connection.sentThisHour >= limits.hourlyLimit) throw new Error('Limite por hora adaptativo da conexão atingido.');
    return connection;
  }

  async function enqueueCampaignMessages(context, campaign, store = database) {
    const contacts = await store.listCampaignContacts(context.companyId, campaign.id);
    const connection = await store.getWhatsappConnection(context.companyId, campaign.connectionId);
    const company = await store.getCompany(context.companyId);
    let offset = 0;
    const jobs = [];
    for (const item of contacts) {
      const contact = await store.getContact(context.companyId, item.contactId);
      if (!contact || contact.status !== 'valid') {
        await store.updateCampaignContact(context.companyId, campaign.id, item.contactId, { status: 'failed' });
        await log(context, { type: 'message.invalid_contact', campaignId: campaign.id, connectionId: campaign.connectionId, contactId: item.contactId, status: 'failed', error: 'Contato inválido ou inexistente.' });
        continue;
      }
      const rendered = renderTemplate(campaign.message, { nome: contact.name, telefone: contact.phone, empresa: company?.name || '', customFields: contact.customFields || {}, ...(contact.customFields || {}) });
      const delayMs = randomDelay(connection.delayMinMs, connection.delayMaxMs);
      offset += delayMs;
      const queueJobId = `send:${context.companyId}:${campaign.id}:${contact.id}`;
      const messageJob = await store.createMessageJob({
        companyId: context.companyId,
        campaignId: campaign.id,
        contactId: contact.id,
        connectionId: connection.id,
        message: rendered,
        mediaUrl: campaign.mediaUrl,
        scheduledAt: new Date(Date.now() + offset).toISOString(),
        idempotencyKey: queueJobId,
        queueJobId,
        status: 'pending',
      });
      if (messageJob.status === 'sent') continue;
      await store.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'queued' });
      jobs.push(await queue.add(config.queueMessageSend || 'attozap.message.send', {
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
    await summarizeCampaign(store, context.companyId, campaign.id);
    return jobs;
  }

  const moduleApi = {
    CONNECTION_STATUSES,
    CAMPAIGN_STATUSES,
    CONTACT_STATUSES,
    normalizeBrazilianPhone,
    renderTemplate,
    parseManualContacts,

    async inbox(context) {
      const contacts = await database.listContacts(context.companyId);
      return contacts.slice(0, 25).map((contact) => ({ leadId: contact.id, leadName: contact.name, phone: contact.phone, stage: contact.status, lastInteractionAt: contact.updatedAt, preview: `Contato ${contact.status} para disparos` }));
    },
    async suggestReply(context, leadId) {
      const contact = await database.getContact(context.companyId, leadId) || database.getLead(context.companyId, leadId);
      if (!contact) return null;
      return `Sugestão ATTOZAP DISPAROS: confirme opt-in, personalize com o nome ${contact.name} e respeite limites da conexão antes do envio.`;
    },

    async listConnections(context) { return database.listWhatsappConnections(context.companyId); },
    async createConnection(context, input) {
      assertAllowed(context, 'criar conexão');
      const normalized = normalizeBrazilianPhone(input.phoneNumber || input.number);
      let connection = await database.createWhatsappConnection({ companyId: context.companyId, name: input.name, phoneNumber: normalized.phone, status: normalized.valid ? 'qr_required' : 'error', dailyLimit: input.dailyLimit, hourlyLimit: input.hourlyLimit, delayMinMs: input.delayMinMs, delayMaxMs: input.delayMaxMs });
      if (normalized.valid && gatewayClient) {
        try {
          const gateway = await gatewayClient.createSession({ companyId: context.companyId, connectionId: connection.id, name: connection.name });
          connection = await database.updateWhatsappConnection(context.companyId, connection.id, { status: gateway.status || connection.status, qrCode: gateway.qrCode || connection.qrCode, sessionPath: gateway.sessionPath || connection.sessionPath });
        } catch (error) {
          connection = await database.updateWhatsappConnection(context.companyId, connection.id, { status: 'error' });
          await log(context, { type: 'connection.gateway_error', connectionId: connection.id, status: 'error', error: error.message });
          if (config.attoEnv === 'production') throw error;
        }
      }
      await log(context, { type: 'connection.qr_generated', connectionId: connection.id, status: connection.status, message: connection.qrCode, error: normalized.error });
      emit(context, 'qr.generated', { connectionId: connection.id, qrCode: connection.qrCode });
      return connection;
    },
    async updateConnectionStatus(context, connectionId, status) {
      assertAllowed(context, 'alterar conexão');
      if (!CONNECTION_STATUSES.includes(status)) throw new Error(`Status inválido: ${status}`);
      const patch = { status, lastHeartbeatAt: new Date().toISOString() };
      if (status === 'connected') patch.connectedAt = patch.lastHeartbeatAt;
      const connection = await database.updateWhatsappConnection(context.companyId, connectionId, patch);
      if (!connection) throw new Error('Conexão não encontrada.');
      await log(context, { type: `connection.${status}`, connectionId, status: 'info', message: `Conexão ${status}` });
      emit(context, 'connection.status_changed', { connectionId, status });
      return connection;
    },

    async listContactLists(context) {
      const lists = await database.listContactLists(context.companyId);
      return Promise.all(lists.map(async (list) => ({ ...list, contacts: (await database.listContacts(context.companyId, list.id)).slice(0, 5) })));
    },
    async createContactList(context, input) {
      assertAllowed(context, 'criar lista');
      return database.transaction(async (tx) => {
        const list = await tx.createContactList({ companyId: context.companyId, name: input.name, source: input.source || 'manual' });
        const rawContacts = Array.isArray(input.contacts) ? input.contacts : parseManualContacts(input.raw || input.text || '');
        const seen = new Set();
        for (const rawContact of rawContacts) {
          const normalized = normalizeBrazilianPhone(rawContact.phone || rawContact.telefone);
          const existing = await tx.listContacts(context.companyId, list.id);
          const duplicate = seen.has(normalized.phone) || existing.some((contact) => contact.phone === normalized.phone);
          seen.add(normalized.phone);
          await tx.createContact({ companyId: context.companyId, listId: list.id, name: rawContact.name || rawContact.nome || normalized.phone, phone: normalized.phone, rawPhone: normalized.raw, tags: rawContact.tags || [], customFields: rawContact.customFields || rawContact.campos || {}, origin: input.source || 'manual', status: !normalized.valid ? 'invalid' : duplicate ? 'duplicate' : 'valid', validationError: normalized.error });
        }
        await tx.createMessageLog({ companyId: context.companyId, type: 'contacts.imported', status: 'info', message: `Lista ${list.name} importada.` });
        return tx.updateContactListStats(context.companyId, list.id);
      });
    },
    async listContacts(context, listId) { return database.listContacts(context.companyId, listId); },

    async listTemplates(context) { return database.listMessageTemplates(context.companyId); },
    async createTemplate(context, input) {
      assertAllowed(context, 'criar template');
      const template = await database.createMessageTemplate({ companyId: context.companyId, name: input.name, body: input.body, mediaUrl: input.mediaUrl, variables: input.variables });
      await log(context, { type: 'template.created', status: 'info', message: template.name });
      return template;
    },
    async previewMessage(context, input) {
      const company = await database.getCompany(context.companyId);
      const contact = input.contactId ? await database.getContact(context.companyId, input.contactId) : null;
      const fakeContact = contact || { name: input.name || 'Maria Silva', phone: input.phone || '5511999990000', customFields: input.customFields || { interesse: 'imóvel' } };
      const rendered = renderTemplate(input.message || input.body, { nome: fakeContact.name, telefone: fakeContact.phone, empresa: company?.name || '', customFields: fakeContact.customFields || {}, ...(fakeContact.customFields || {}) });
      return { rendered, length: rendered.length, valid: rendered.trim().length > 0 };
    },

    async listCampaigns(context) {
      const campaigns = await database.listCampaigns(context.companyId);
      return Promise.all(campaigns.map((campaign) => summarizeCampaign(database, context.companyId, campaign.id)));
    },
    async getCampaign(context, campaignId) {
      const campaign = await summarizeCampaign(database, context.companyId, campaignId);
      if (!campaign) return null;
      const [connection, contactList, jobs] = await Promise.all([
        database.getWhatsappConnection(context.companyId, campaign.connectionId),
        database.getContactList(context.companyId, campaign.contactListId),
        database.listMessageJobs(context.companyId, campaign.id),
      ]);
      return { ...campaign, connection, contactList, jobs };
    },
    async createCampaign(context, input) {
      assertAllowed(context, 'criar campanha');
      return database.transaction(async (tx) => {
        const contacts = (await tx.listContacts(context.companyId, input.contactListId)).filter((contact) => contact.status === 'valid');
        const campaign = await tx.createCampaign({ companyId: context.companyId, name: input.name, connectionId: input.connectionId, contactListId: input.contactListId, message: input.message, mediaUrl: input.mediaUrl, scheduledAt: input.scheduledAt, totalContacts: contacts.length, totalPending: contacts.length });
        for (const contact of contacts) await tx.addCampaignContact({ companyId: context.companyId, campaignId: campaign.id, contactId: contact.id });
        await tx.createMessageLog({ companyId: context.companyId, type: 'campaign.created', campaignId: campaign.id, connectionId: campaign.connectionId, status: 'info', message: campaign.name });
        return campaign;
      });
    },
    async updateCampaign(context, campaignId, input) {
      assertAllowed(context, 'editar campanha');
      const campaign = await database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      if (campaign.status !== 'draft') throw new Error('Só é permitido editar campanhas em draft.');
      return database.updateCampaign(context.companyId, campaignId, input);
    },
    async startCampaign(context, campaignId) {
      assertAllowed(context, 'iniciar campanha');
      await ensureCompanyCanSend(context);
      const campaign = await database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) throw new Error(`Campanha não pode iniciar a partir do status ${campaign.status}.`);
      await ensureConnectionReady(context, campaign.connectionId);
      const jobs = await database.transaction(async (tx) => {
        await tx.updateCampaign(context.companyId, campaignId, { status: 'running', startedAt: campaign.startedAt || new Date().toISOString(), finishedAt: null });
        const updated = await tx.getCampaign(context.companyId, campaignId);
        return enqueueCampaignMessages(context, updated, tx);
      });
      await log(context, { type: 'campaign.started', campaignId, connectionId: campaign.connectionId, status: 'running', message: `${jobs.length} mensagens enfileiradas.` });
      emit(context, 'campaign.progress', { campaignId, queued: jobs.length });
      return moduleApi.getCampaign(context, campaignId);
    },
    async pauseCampaign(context, campaignId) {
      assertAllowed(context, 'pausar campanha');
      const campaign = await database.transaction(async (tx) => tx.updateCampaign(context.companyId, campaignId, { status: 'paused' }));
      await queue.pauseCampaign(campaignId);
      await log(context, { type: 'campaign.paused', campaignId, connectionId: campaign?.connectionId, status: 'paused' });
      return campaign;
    },
    async resumeCampaign(context, campaignId) {
      assertAllowed(context, 'retomar campanha');
      const campaign = await database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      await ensureConnectionReady(context, campaign.connectionId);
      await database.transaction(async (tx) => tx.updateCampaign(context.companyId, campaignId, { status: 'running' }));
      await queue.resumeCampaign(campaignId);
      await log(context, { type: 'campaign.resumed', campaignId, connectionId: campaign.connectionId, status: 'running' });
      return moduleApi.getCampaign(context, campaignId);
    },
    async cancelCampaign(context, campaignId) {
      assertAllowed(context, 'cancelar campanha');
      const campaign = await database.transaction(async (tx) => {
        const updated = await tx.updateCampaign(context.companyId, campaignId, { status: 'canceled', finishedAt: new Date().toISOString() });
        const items = await tx.listCampaignContacts(context.companyId, campaignId);
        for (const item of items) if (['pending', 'queued', 'sending'].includes(item.status)) await tx.updateCampaignContact(context.companyId, campaignId, item.contactId, { status: 'canceled' });
        return updated;
      });
      await queue.cancelCampaign(campaignId);
      await log(context, { type: 'campaign.canceled', campaignId, connectionId: campaign?.connectionId, status: 'canceled' });
      return campaign;
    },
    async deleteCampaign(context, campaignId) {
      assertAllowed(context, 'excluir campanha');
      const campaign = await database.getCampaign(context.companyId, campaignId);
      if (!campaign) return false;
      if (!['draft', 'canceled', 'failed', 'completed'].includes(campaign.status)) throw new Error('Campanha em execução não pode ser excluída.');
      const deleted = await database.deleteCampaign(context.companyId, campaignId);
      await log(context, { type: 'campaign.deleted', campaignId, status: 'info' });
      return deleted;
    },
    async duplicateCampaign(context, campaignId) {
      assertAllowed(context, 'duplicar campanha');
      const campaign = await database.getCampaign(context.companyId, campaignId);
      if (!campaign) throw new Error('Campanha não encontrada.');
      return moduleApi.createCampaign(context, { ...campaign, name: `${campaign.name} (cópia)` });
    },
    async listLogs(context, filters = {}) { return database.listMessageLogs(context.companyId, filters); },
    async handleMessageAck(context, payload) {
      const status = ackToStatus(payload.ackStatus);
      const nowIso = new Date().toISOString();
      const job = await database.findMessageJobByProviderId(context.companyId, payload.providerMessageId);
      if (!job) {
        await log(context, { type: 'message.ack_unmatched', connectionId: payload.connectionId, status: 'warning', message: payload.providerMessageId, metadata: payload });
        return { ok: false, matched: false };
      }
      const jobPatch = { ackStatus: payload.ackStatus, providerChatId: payload.providerChatId || job.providerChatId };
      if (status === 'delivered') {
        jobPatch.status = 'delivered';
        jobPatch.deliveredAt = payload.deliveredAt || nowIso;
      }
      if (status === 'read') {
        jobPatch.status = 'read';
        jobPatch.readAt = payload.readAt || nowIso;
        jobPatch.deliveredAt = job.deliveredAt || payload.deliveredAt || nowIso;
      }
      const updatedJob = await database.updateMessageJob(context.companyId, job.id, jobPatch);
      const contactPatch = { status, ackStatus: payload.ackStatus, providerMessageId: job.providerMessageId, providerChatId: payload.providerChatId || job.providerChatId };
      if (status === 'delivered') contactPatch.deliveredAt = jobPatch.deliveredAt;
      if (status === 'read') {
        contactPatch.readAt = jobPatch.readAt;
        contactPatch.deliveredAt = jobPatch.deliveredAt;
      }
      await database.updateCampaignContact(context.companyId, job.campaignId, job.contactId, contactPatch);
      const connection = await database.getWhatsappConnection(context.companyId, job.connectionId);
      if (connection) await database.updateWhatsappConnection(context.companyId, connection.id, applyHealthEvent(connection, status));
      await log(context, { type: `message.${status}`, campaignId: job.campaignId, connectionId: job.connectionId, messageJobId: job.id, contactId: job.contactId, status, metadata: payload });
      await summarizeCampaign(database, context.companyId, job.campaignId);
      emit(context, `message.${status}`, { campaignId: job.campaignId, connectionId: job.connectionId, messageJobId: job.id, contactId: job.contactId, ackStatus: payload.ackStatus });
      return { ok: true, matched: true, job: updatedJob };
    },
    async handleInboundMessage(context, payload) {
      const normalized = normalizeBrazilianPhone(payload.from || payload.phone || payload.providerChatId);
      const contact = await database.findContactByPhone(context.companyId, normalized.phone);
      if (!contact) {
        await log(context, { type: 'message.inbound', connectionId: payload.connectionId, status: 'info', message: payload.message, metadata: payload });
        return { ok: true, matched: false };
      }
      const campaigns = (await database.listCampaigns(context.companyId)).filter((campaign) => campaign.connectionId === payload.connectionId);
      let matched = null;
      for (const campaign of campaigns) {
        const items = await database.listCampaignContacts(context.companyId, campaign.id);
        matched = items.find((item) => item.contactId === contact.id && ['sent', 'delivered', 'read'].includes(item.status));
        if (matched) {
          await database.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'replied', repliedAt: payload.timestamp || new Date().toISOString(), providerChatId: payload.providerChatId });
          await log(context, { type: 'message.replied', campaignId: campaign.id, connectionId: payload.connectionId, contactId: contact.id, status: 'replied', message: payload.message, metadata: payload });
          const connection = await database.getWhatsappConnection(context.companyId, payload.connectionId);
          if (connection) await database.updateWhatsappConnection(context.companyId, connection.id, { ...applyHealthEvent(connection, 'replied'), messagesReceived: (connection.messagesReceived || 0) + 1 });
          await summarizeCampaign(database, context.companyId, campaign.id);
          emit(context, 'message.replied', { campaignId: campaign.id, connectionId: payload.connectionId, contactId: contact.id });
          return { ok: true, matched: true };
        }
      }
      await log(context, { type: 'message.inbound', connectionId: payload.connectionId, contactId: contact.id, status: 'info', message: payload.message, metadata: payload });
      return { ok: true, matched: false };
    },
    async processMessageJob(context, messageJobId) {
      const result = await database.transaction(async (tx) => {
        const job = await tx.getMessageJob(context.companyId, messageJobId);
        if (!job || ['sent', 'delivered', 'read', 'canceled', 'blocked'].includes(job.status) || job.providerMessageId) return job;
        const campaign = await tx.getCampaign(context.companyId, job.campaignId);
        const contact = await tx.getContact(context.companyId, job.contactId);
        if (!campaign || campaign.status !== 'running') throw new Error('Campanha não está ativa.');
        if (!contact || contact.status !== 'valid') throw new Error('Contato inválido.');
        const connection = await tx.getWhatsappConnection(context.companyId, job.connectionId);
        if (!connection || connection.status !== 'connected') throw new Error('Conexão WhatsApp não está conectada.');
        const limits = adaptiveLimits(connection);
        if (limits.blocked) throw new Error('Conexão bloqueada por healthScore.');
        if (connection.sentToday >= connection.dailyLimit) throw new Error('Limite diário da conexão atingido.');
        if (connection.sentThisHour >= limits.hourlyLimit) throw new Error('Limite por hora adaptativo da conexão atingido.');
        if (limits.state !== 'healthy') await tx.createMessageLog({ companyId: context.companyId, type: 'rate_limit.adapted', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, status: limits.state, metadata: limits });
        await tx.updateMessageJob(context.companyId, messageJobId, { status: 'sending', attempt: job.attempt + 1, startedAt: new Date().toISOString() });
        await tx.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'sending' });
        await tx.createMessageLog({ companyId: context.companyId, type: 'message.sending', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, status: 'sending' });
        if (!gatewayClient) throw new Error('Gateway WhatsApp não configurado.');
        try {
          const gatewayResult = await gatewayClient.sendMessage({ companyId: context.companyId, connectionId: connection.id, phone: contact.phone, message: job.message, mediaUrl: job.mediaUrl });
          if (config.attoEnv === 'production' && gatewayResult.dryRun) throw new Error('Gateway retornou dryRun em production.');
          const providerMessageId = gatewayResult.messageId || gatewayResult.providerMessageId;
          if (!providerMessageId) throw new Error('Gateway não retornou providerMessageId. Mensagem não será marcada como sent.');
          await tx.updateMessageJob(context.companyId, messageJobId, { status: 'sent', providerMessageId, providerChatId: gatewayResult.jid || gatewayResult.providerChatId, sentAt: new Date().toISOString() });
          await tx.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'sent', providerMessageId, providerChatId: gatewayResult.jid || gatewayResult.providerChatId });
          await tx.updateWhatsappConnection(context.companyId, connection.id, { ...applyHealthEvent(connection, 'sent'), messagesSent: connection.messagesSent + 1, sentToday: connection.sentToday + 1, sentThisHour: connection.sentThisHour + 1, sentLastHour: (connection.sentLastHour || 0) + 1, lastHeartbeatAt: new Date().toISOString() });
          await tx.createMessageLog({ companyId: context.companyId, type: 'message.sent', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, message: job.message, status: 'sent', metadata: { providerMessageId } });
          const updated = await summarizeCampaign(tx, context.companyId, campaign.id);
          if (updated.totalPending === 0 && updated.totalFailures === 0) {
            await tx.updateCampaign(context.companyId, campaign.id, { status: 'completed', finishedAt: new Date().toISOString() });
            await tx.createMessageLog({ companyId: context.companyId, type: 'campaign.completed', campaignId: campaign.id, connectionId: connection.id, status: 'completed' });
            emit(context, 'campaign.completed', { campaignId: campaign.id });
          }
          emit(context, 'message.sent', { campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id });
          return tx.getMessageJob(context.companyId, messageJobId);
        } catch (error) {
          const classified = classifyDeliveryError(error);
          const healthEvent = classified.category === CATEGORIES.CONNECTION_RISK ? (classified.shouldBlockConnection ? 'banned' : 'connection_failure') : classified.category === CATEGORIES.PERMANENT ? 'permanent_failure' : 'temporary_failure';
          const healthPatch = applyHealthEvent(connection, healthEvent);
          const basePatch = { error: error.message, lastErrorCode: classified.code, lastErrorMessage: classified.message, retryReason: classified.category, retryCount: (job.retryCount || 0) + 1 };
          if (classified.category === CATEGORIES.TEMPORARY && (job.attempt + 1) < job.maxAttempts) {
            await tx.updateMessageJob(context.companyId, messageJobId, { ...basePatch, status: 'retrying' });
            await tx.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'queued', lastErrorCode: classified.code, lastErrorMessage: classified.message });
            await tx.updateWhatsappConnection(context.companyId, connection.id, { ...healthPatch, failedLastHour: (connection.failedLastHour || 0) + 1, totalFailures: (connection.totalFailures || 0) + 1 });
            await tx.createMessageLog({ companyId: context.companyId, type: 'message.retrying', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, status: 'retrying', error: error.message, metadata: classified });
            return { __retryError: error.message, messageJobId };
          }
          if (classified.category === CATEGORIES.CONNECTION_RISK) {
            const connectionStatus = classified.shouldBlockConnection || healthPatch.healthState === 'blocked' ? 'blocked' : 'reconnecting';
            await tx.updateMessageJob(context.companyId, messageJobId, { ...basePatch, status: classified.shouldBlockConnection ? 'blocked' : 'failed', failedAt: new Date().toISOString() });
            await tx.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: classified.shouldBlockConnection ? 'blocked' : 'failed', failedAt: new Date().toISOString(), lastErrorCode: classified.code, lastErrorMessage: classified.message });
            await tx.updateWhatsappConnection(context.companyId, connection.id, { ...healthPatch, status: connectionStatus, failedLastHour: (connection.failedLastHour || 0) + 1, totalFailures: (connection.totalFailures || 0) + 1 });
            await tx.updateCampaign(context.companyId, campaign.id, { status: 'paused', pauseReason: classified.shouldBlockConnection ? 'connection_blocked' : 'connection_degraded' });
            await tx.createMessageLog({ companyId: context.companyId, type: classified.shouldBlockConnection ? 'connection.blocked' : 'connection.degraded', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, status: connectionStatus, error: error.message, metadata: classified });
            emit(context, classified.shouldBlockConnection ? 'connection.blocked' : 'connection.degraded', { campaignId: campaign.id, connectionId: connection.id, reason: classified.code });
            return tx.getMessageJob(context.companyId, messageJobId);
          }
          await tx.updateMessageJob(context.companyId, messageJobId, { ...basePatch, status: 'failed', failedAt: new Date().toISOString() });
          await tx.updateCampaignContact(context.companyId, campaign.id, contact.id, { status: 'failed', failedAt: new Date().toISOString(), lastErrorCode: classified.code, lastErrorMessage: classified.message });
          await tx.updateWhatsappConnection(context.companyId, connection.id, { ...healthPatch, failedLastHour: (connection.failedLastHour || 0) + 1, totalFailures: (connection.totalFailures || 0) + 1 });
          await tx.createMessageLog({ companyId: context.companyId, type: 'message.failed', campaignId: campaign.id, connectionId: connection.id, messageJobId, contactId: contact.id, status: 'failed', error: error.message, metadata: classified });
          await summarizeCampaign(tx, context.companyId, campaign.id);
          return tx.getMessageJob(context.companyId, messageJobId);
        }
      });
      if (result?.__retryError) throw new Error(result.__retryError);
      return result;
    },
  };

  return moduleApi;
}

module.exports = { createAttoZapModule, normalizeBrazilianPhone, renderTemplate, parseManualContacts, CONNECTION_STATUSES, CAMPAIGN_STATUSES, CONTACT_STATUSES };
