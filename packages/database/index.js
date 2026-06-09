const { randomUUID } = require('node:crypto');

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function byCompany(companyId) {
  return (entry) => entry.companyId === companyId;
}

function createDatabase() {
  const db = {
    companies: [],
    users: [],
    leads: [],
    leadEvents: [],
    whatsappConnections: [],
    contactLists: [],
    contacts: [],
    messageTemplates: [],
    campaigns: [],
    campaignContacts: [],
    messageJobs: [],
    messageLogs: [],
    auditLogs: [],
    automationRuns: [],
    scoreEvents: [],
    tasks: [],
  };

  seed(db);

  const database = {
    db,
    createId,
    now,
    listCompanies: () => db.companies,
    getCompany: (companyId) => db.companies.find((company) => company.id === companyId),
    updateCompany(companyId, patch) {
      const company = this.getCompany(companyId);
      if (!company) return null;
      Object.assign(company, patch, { updatedAt: now() });
      return company;
    },
    listUsers: (companyId) => db.users.filter(byCompany(companyId)),
    getUser: (companyId, userId) => db.users.find((user) => user.companyId === companyId && user.id === userId),
    listLeads: (companyId) => db.leads.filter(byCompany(companyId)),
    getLead: (companyId, leadId) => db.leads.find((lead) => lead.companyId === companyId && lead.id === leadId),
    createLead(input) {
      const lead = {
        id: createId('lead'),
        companyId: input.companyId,
        name: input.name,
        phone: input.phone,
        cpf: input.cpf || '',
        origin: input.origin || 'manual',
        stage: input.stage || 'Oferta Ativa',
        assignedUserId: input.assignedUserId,
        tags: input.tags || [],
        notes: input.notes || [],
        score: 0,
        createdAt: now(),
        updatedAt: now(),
        lastInteractionAt: now(),
      };
      db.leads.push(lead);
      this.addLeadEvent(input.companyId, lead.id, 'lead.created', { lead });
      return lead;
    },
    moveLead(companyId, leadId, stage) {
      const lead = this.getLead(companyId, leadId);
      if (!lead) return null;
      const previousStage = lead.stage;
      lead.stage = stage;
      lead.updatedAt = now();
      this.addLeadEvent(companyId, leadId, 'lead.stage_moved', { previousStage, stage });
      return lead;
    },
    addLeadNote(companyId, leadId, note) {
      const lead = this.getLead(companyId, leadId);
      if (!lead) return null;
      const entry = { id: createId('note'), body: note, createdAt: now() };
      lead.notes.push(entry);
      lead.updatedAt = now();
      this.addLeadEvent(companyId, leadId, 'lead.note_added', entry);
      return entry;
    },
    addLeadEvent(companyId, leadId, type, payload) {
      const event = { id: createId('evt'), companyId, leadId, type, payload, createdAt: now() };
      db.leadEvents.push(event);
      return event;
    },
    listLeadEvents(companyId, leadId) {
      return db.leadEvents.filter((event) => event.companyId === companyId && event.leadId === leadId);
    },

    listWhatsappConnections(companyId) {
      return db.whatsappConnections.filter(byCompany(companyId));
    },
    getWhatsappConnection(companyId, connectionId) {
      return db.whatsappConnections.find((connection) => connection.companyId === companyId && connection.id === connectionId);
    },
    createWhatsappConnection(input) {
      const connection = {
        id: createId('wa'),
        companyId: input.companyId,
        name: input.name,
        phoneNumber: input.phoneNumber,
        status: input.status || 'qr_required',
        qrCode: input.qrCode || `attozap:${input.companyId}:${Date.now()}`,
        connectedAt: input.connectedAt || null,
        lastHeartbeatAt: input.lastHeartbeatAt || now(),
        messagesSent: input.messagesSent ?? 0,
        messagesReceived: input.messagesReceived ?? 0,
        totalFailures: input.totalFailures ?? 0,
        dailyLimit: input.dailyLimit ?? 500,
        hourlyLimit: input.hourlyLimit ?? 60,
        delayMinMs: input.delayMinMs ?? 12_000,
        delayMaxMs: input.delayMaxMs ?? 45_000,
        sentToday: input.sentToday ?? 0,
        sentThisHour: input.sentThisHour ?? 0,
        healthScore: input.healthScore ?? 100,
        sessionPath: input.sessionPath || `sessions/${input.companyId}/${createId('session')}`,
        createdAt: now(),
        updatedAt: now(),
      };
      db.whatsappConnections.push(connection);
      return connection;
    },
    updateWhatsappConnection(companyId, connectionId, patch) {
      const connection = this.getWhatsappConnection(companyId, connectionId);
      if (!connection) return null;
      Object.assign(connection, patch, { updatedAt: now() });
      return connection;
    },

    listContactLists(companyId) {
      return db.contactLists.filter(byCompany(companyId));
    },
    getContactList(companyId, listId) {
      return db.contactLists.find((list) => list.companyId === companyId && list.id === listId);
    },
    createContactList(input) {
      const list = {
        id: createId('list'),
        companyId: input.companyId,
        name: input.name,
        source: input.source || 'manual',
        totalContacts: 0,
        validContacts: 0,
        invalidContacts: 0,
        duplicateContacts: 0,
        createdAt: now(),
        updatedAt: now(),
      };
      db.contactLists.push(list);
      return list;
    },
    updateContactListStats(companyId, listId) {
      const list = this.getContactList(companyId, listId);
      if (!list) return null;
      const contacts = this.listContacts(companyId, listId);
      list.totalContacts = contacts.length;
      list.validContacts = contacts.filter((contact) => contact.status === 'valid').length;
      list.invalidContacts = contacts.filter((contact) => contact.status === 'invalid').length;
      list.duplicateContacts = contacts.filter((contact) => contact.status === 'duplicate').length;
      list.updatedAt = now();
      return list;
    },
    listContacts(companyId, listId) {
      return db.contacts.filter((contact) => contact.companyId === companyId && (!listId || contact.listId === listId));
    },
    getContact(companyId, contactId) {
      return db.contacts.find((contact) => contact.companyId === companyId && contact.id === contactId);
    },
    createContact(input) {
      const contact = {
        id: createId('contact'),
        companyId: input.companyId,
        listId: input.listId,
        name: input.name,
        phone: input.phone,
        rawPhone: input.rawPhone || input.phone,
        tags: input.tags || [],
        customFields: input.customFields || {},
        origin: input.origin || 'manual',
        status: input.status || 'valid',
        validationError: input.validationError || null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.contacts.push(contact);
      this.updateContactListStats(input.companyId, input.listId);
      return contact;
    },

    listMessageTemplates(companyId) {
      return db.messageTemplates.filter(byCompany(companyId));
    },
    getMessageTemplate(companyId, templateId) {
      return db.messageTemplates.find((template) => template.companyId === companyId && template.id === templateId);
    },
    createMessageTemplate(input) {
      const template = {
        id: createId('tpl'),
        companyId: input.companyId,
        name: input.name,
        body: input.body,
        mediaUrl: input.mediaUrl || '',
        variables: input.variables || ['nome', 'telefone', 'empresa'],
        createdAt: now(),
        updatedAt: now(),
      };
      db.messageTemplates.push(template);
      return template;
    },

    listCampaigns(companyId) {
      return db.campaigns.filter(byCompany(companyId));
    },
    getCampaign(companyId, campaignId) {
      return db.campaigns.find((campaign) => campaign.companyId === companyId && campaign.id === campaignId);
    },
    createCampaign(input) {
      const campaign = {
        id: createId('camp'),
        companyId: input.companyId,
        name: input.name,
        connectionId: input.connectionId || null,
        contactListId: input.contactListId || null,
        message: input.message,
        mediaUrl: input.mediaUrl || '',
        status: input.status || 'draft',
        filters: input.filters || {},
        totalContacts: input.totalContacts ?? 0,
        totalSent: input.totalSent ?? 0,
        totalDelivered: input.totalDelivered ?? 0,
        totalFailures: input.totalFailures ?? 0,
        totalPending: input.totalPending ?? 0,
        scheduledAt: input.scheduledAt || null,
        startedAt: input.startedAt || null,
        finishedAt: input.finishedAt || null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.campaigns.push(campaign);
      return campaign;
    },
    updateCampaign(companyId, campaignId, patch) {
      const campaign = this.getCampaign(companyId, campaignId);
      if (!campaign) return null;
      Object.assign(campaign, patch, { updatedAt: now() });
      return campaign;
    },
    deleteCampaign(companyId, campaignId) {
      const index = db.campaigns.findIndex((campaign) => campaign.companyId === companyId && campaign.id === campaignId);
      if (index === -1) return false;
      db.campaigns.splice(index, 1);
      db.campaignContacts = db.campaignContacts.filter((item) => item.companyId !== companyId || item.campaignId !== campaignId);
      db.messageJobs = db.messageJobs.filter((job) => job.companyId !== companyId || job.campaignId !== campaignId);
      return true;
    },
    listCampaignContacts(companyId, campaignId) {
      return db.campaignContacts.filter((item) => item.companyId === companyId && item.campaignId === campaignId);
    },
    addCampaignContact(input) {
      const item = {
        id: createId('cc'),
        companyId: input.companyId,
        campaignId: input.campaignId,
        contactId: input.contactId,
        status: input.status || 'pending',
        createdAt: now(),
        updatedAt: now(),
      };
      db.campaignContacts.push(item);
      return item;
    },
    updateCampaignContact(companyId, campaignId, contactId, patch) {
      const item = db.campaignContacts.find((entry) => entry.companyId === companyId && entry.campaignId === campaignId && entry.contactId === contactId);
      if (!item) return null;
      Object.assign(item, patch, { updatedAt: now() });
      return item;
    },

    listMessageJobs(companyId, campaignId) {
      return db.messageJobs.filter((job) => job.companyId === companyId && (!campaignId || job.campaignId === campaignId));
    },
    getMessageJob(companyId, jobId) {
      return db.messageJobs.find((job) => job.companyId === companyId && job.id === jobId);
    },
    createMessageJob(input) {
      const job = {
        id: createId('msgjob'),
        companyId: input.companyId,
        campaignId: input.campaignId,
        contactId: input.contactId,
        connectionId: input.connectionId,
        message: input.message,
        mediaUrl: input.mediaUrl || '',
        attempt: input.attempt ?? 0,
        maxAttempts: input.maxAttempts ?? 3,
        status: input.status || 'pending',
        scheduledAt: input.scheduledAt || now(),
        idempotencyKey: input.idempotencyKey,
        createdAt: now(),
        updatedAt: now(),
      };
      const existing = db.messageJobs.find((entry) => entry.companyId === job.companyId && entry.idempotencyKey === job.idempotencyKey);
      if (existing) return existing;
      db.messageJobs.push(job);
      return job;
    },
    updateMessageJob(companyId, jobId, patch) {
      const job = this.getMessageJob(companyId, jobId);
      if (!job) return null;
      Object.assign(job, patch, { updatedAt: now() });
      return job;
    },

    listMessageLogs(companyId, filters = {}) {
      return db.messageLogs.filter((log) => log.companyId === companyId && (!filters.campaignId || log.campaignId === filters.campaignId) && (!filters.connectionId || log.connectionId === filters.connectionId));
    },
    createMessageLog(input) {
      const log = {
        id: createId('log'),
        companyId: input.companyId,
        type: input.type,
        campaignId: input.campaignId || null,
        connectionId: input.connectionId || null,
        messageJobId: input.messageJobId || null,
        contactId: input.contactId || null,
        message: input.message || '',
        status: input.status || 'info',
        error: input.error || null,
        createdAt: now(),
      };
      db.messageLogs.push(log);
      return log;
    },
    createAuditLog(input) {
      const log = { id: createId('audit'), createdAt: now(), ...input };
      db.auditLogs.push(log);
      return log;
    },
    listAuditLogs(companyId) {
      return db.auditLogs.filter(byCompany(companyId));
    },

    addScoreEvent(input) {
      const event = { id: createId('score'), createdAt: now(), ...input };
      db.scoreEvents.push(event);
      return event;
    },
    listScoreEvents(companyId) {
      return db.scoreEvents.filter(byCompany(companyId));
    },
    addTask(input) {
      const task = { id: createId('task'), status: 'open', createdAt: now(), ...input };
      db.tasks.push(task);
      return task;
    },
    listTasks(companyId) {
      return db.tasks.filter(byCompany(companyId));
    },
  };

  return database;
}

function seed(db) {
  const companyId = 'company_atto_demo';
  const ownerId = 'user_owner_demo';
  const brokerId = 'user_broker_demo';
  const createdAt = now();

  db.companies.push({
    id: companyId,
    name: 'ATTO Demo Imobiliária',
    slug: 'atto-demo',
    plan: 'growth',
    status: 'active',
    createdAt,
  });

  db.users.push(
    { id: ownerId, companyId, name: 'Owner Demo', email: 'owner@attoflow.local', role: 'owner' },
    { id: brokerId, companyId, name: 'Operador Disparos', email: 'operador@attoflow.local', role: 'manager', managerId: ownerId },
  );

  db.leads.push(
    {
      id: 'lead_demo_ana',
      companyId,
      name: 'Ana Souza',
      phone: '+5511999990001',
      cpf: '00000000000',
      origin: 'Instagram',
      stage: 'Conversando',
      assignedUserId: brokerId,
      tags: ['alto-interesse', 'zona-sul'],
      notes: [{ id: 'note_demo_1', body: 'Busca apartamento com 2 quartos.', createdAt }],
      score: 78,
      createdAt,
      updatedAt: createdAt,
      lastInteractionAt: createdAt,
    },
    {
      id: 'lead_demo_bruno',
      companyId,
      name: 'Bruno Lima',
      phone: '+5511999990002',
      cpf: '',
      origin: 'Campanha WhatsApp',
      stage: 'Agendado',
      assignedUserId: brokerId,
      tags: ['financiamento'],
      notes: [],
      score: 64,
      createdAt,
      updatedAt: createdAt,
      lastInteractionAt: createdAt,
    },
  );

  db.whatsappConnections.push({
    id: 'wa_demo_main',
    companyId,
    name: 'Disparos Principal',
    phoneNumber: '5511888880000',
    status: 'connected',
    qrCode: '',
    connectedAt: createdAt,
    lastHeartbeatAt: createdAt,
    messagesSent: 143,
    messagesReceived: 96,
    totalFailures: 2,
    dailyLimit: 500,
    hourlyLimit: 60,
    delayMinMs: 12_000,
    delayMaxMs: 45_000,
    sentToday: 143,
    sentThisHour: 8,
    healthScore: 98,
    sessionPath: `sessions/${companyId}/wa_demo_main`,
    createdAt,
    updatedAt: createdAt,
  });

  db.contactLists.push({
    id: 'list_demo_investidores',
    companyId,
    name: 'Investidores Zona Sul',
    source: 'manual',
    totalContacts: 2,
    validContacts: 2,
    invalidContacts: 0,
    duplicateContacts: 0,
    createdAt,
    updatedAt: createdAt,
  });

  db.contacts.push(
    { id: 'contact_demo_ana', companyId, listId: 'list_demo_investidores', name: 'Ana Souza', phone: '5511999990001', rawPhone: '(11) 99999-0001', tags: ['zona-sul'], customFields: { interesse: '2 quartos' }, origin: 'manual', status: 'valid', validationError: null, createdAt, updatedAt: createdAt },
    { id: 'contact_demo_bruno', companyId, listId: 'list_demo_investidores', name: 'Bruno Lima', phone: '5511999990002', rawPhone: '11999990002', tags: ['financiamento'], customFields: { interesse: 'financiamento' }, origin: 'manual', status: 'valid', validationError: null, createdAt, updatedAt: createdAt },
  );

  db.messageTemplates.push({
    id: 'tpl_demo_oportunidade',
    companyId,
    name: 'Oportunidade com variação',
    body: 'Olá {{nome}}, {tudo bem?|como vai?} Tenho uma oportunidade para {{empresa}} alinhada ao seu interesse em {{interesse}}.',
    mediaUrl: '',
    variables: ['nome', 'telefone', 'empresa', 'interesse'],
    createdAt,
    updatedAt: createdAt,
  });

  db.campaigns.push({
    id: 'camp_demo_open_house',
    companyId,
    name: 'Open House Zona Sul',
    connectionId: 'wa_demo_main',
    contactListId: 'list_demo_investidores',
    status: 'draft',
    message: 'Olá {{nome}}, temos uma oportunidade na região que você procurou.',
    mediaUrl: '',
    filters: { tags: ['zona-sul'] },
    totalContacts: 2,
    totalSent: 0,
    totalDelivered: 0,
    totalFailures: 0,
    totalPending: 2,
    scheduledAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt: createdAt,
  });

  db.campaignContacts.push(
    { id: 'cc_demo_ana', companyId, campaignId: 'camp_demo_open_house', contactId: 'contact_demo_ana', status: 'pending', createdAt, updatedAt: createdAt },
    { id: 'cc_demo_bruno', companyId, campaignId: 'camp_demo_open_house', contactId: 'contact_demo_bruno', status: 'pending', createdAt, updatedAt: createdAt },
  );
}

module.exports = { createDatabase };
