const { randomUUID } = require('node:crypto');

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function createDatabase() {
  const db = {
    companies: [],
    users: [],
    leads: [],
    leadEvents: [],
    whatsappConnections: [],
    campaigns: [],
    automationRuns: [],
    scoreEvents: [],
    tasks: [],
  };

  seed(db);

  return {
    db,
    createId,
    now,
    listCompanies: () => db.companies,
    getCompany: (companyId) => db.companies.find((company) => company.id === companyId),
    listUsers: (companyId) => db.users.filter((user) => user.companyId === companyId),
    getUser: (companyId, userId) => db.users.find((user) => user.companyId === companyId && user.id === userId),
    listLeads: (companyId) => db.leads.filter((lead) => lead.companyId === companyId),
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
      return db.whatsappConnections.filter((connection) => connection.companyId === companyId);
    },
    createWhatsappConnection(input) {
      const connection = {
        id: createId('wa'),
        companyId: input.companyId,
        name: input.name,
        phoneNumber: input.phoneNumber,
        status: 'qr_required',
        messagesSent: 0,
        messagesReceived: 0,
        healthScore: 100,
        createdAt: now(),
        updatedAt: now(),
      };
      db.whatsappConnections.push(connection);
      return connection;
    },
    listCampaigns(companyId) {
      return db.campaigns.filter((campaign) => campaign.companyId === companyId);
    },
    createCampaign(input) {
      const campaign = {
        id: createId('camp'),
        companyId: input.companyId,
        name: input.name,
        status: 'draft',
        message: input.message,
        filters: input.filters || {},
        createdAt: now(),
        updatedAt: now(),
      };
      db.campaigns.push(campaign);
      return campaign;
    },
    addScoreEvent(input) {
      const event = { id: createId('score'), createdAt: now(), ...input };
      db.scoreEvents.push(event);
      return event;
    },
    listScoreEvents(companyId) {
      return db.scoreEvents.filter((event) => event.companyId === companyId);
    },
    addTask(input) {
      const task = { id: createId('task'), status: 'open', createdAt: now(), ...input };
      db.tasks.push(task);
      return task;
    },
    listTasks(companyId) {
      return db.tasks.filter((task) => task.companyId === companyId);
    },
  };
}

function seed(db) {
  const companyId = 'company_atto_demo';
  const ownerId = 'user_owner_demo';
  const brokerId = 'user_broker_demo';

  db.companies.push({
    id: companyId,
    name: 'ATTO Demo Imobiliária',
    slug: 'atto-demo',
    plan: 'growth',
    createdAt: now(),
  });

  db.users.push(
    { id: ownerId, companyId, name: 'Owner Demo', email: 'owner@attoflow.local', role: 'owner' },
    { id: brokerId, companyId, name: 'Corretor Demo', email: 'corretor@attoflow.local', role: 'broker', managerId: ownerId },
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
      notes: [{ id: 'note_demo_1', body: 'Busca apartamento com 2 quartos.', createdAt: now() }],
      score: 78,
      createdAt: now(),
      updatedAt: now(),
      lastInteractionAt: now(),
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
      createdAt: now(),
      updatedAt: now(),
      lastInteractionAt: now(),
    },
  );

  db.whatsappConnections.push({
    id: 'wa_demo_main',
    companyId,
    name: 'Comercial Principal',
    phoneNumber: '+5511888880000',
    status: 'connected',
    messagesSent: 143,
    messagesReceived: 96,
    healthScore: 98,
    createdAt: now(),
    updatedAt: now(),
  });

  db.campaigns.push({
    id: 'camp_demo_open_house',
    companyId,
    name: 'Open House Zona Sul',
    status: 'scheduled',
    message: 'Olá {{nome}}, temos uma oportunidade na região que você procurou.',
    filters: { tags: ['zona-sul'] },
    createdAt: now(),
    updatedAt: now(),
  });
}

module.exports = { createDatabase };
