const { randomUUID } = require('node:crypto');
const { createDatabase: createMemoryDatabase } = require('./memory');
const { requireCompanyId } = require('./scope');
const { CompanyRepository } = require('./repositories/company.repository');
const { UserRepository } = require('./repositories/user.repository');
const { ConnectionRepository } = require('./repositories/connection.repository');
const { ContactListRepository } = require('./repositories/contact-list.repository');
const { ContactRepository } = require('./repositories/contact.repository');
const { TemplateRepository } = require('./repositories/template.repository');
const { CampaignRepository } = require('./repositories/campaign.repository');
const { CampaignContactRepository } = require('./repositories/campaign-contact.repository');
const { MessageJobRepository } = require('./repositories/message-job.repository');
const { MessageLogRepository } = require('./repositories/message-log.repository');
const { AuditLogRepository } = require('./repositories/audit-log.repository');

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function requirePrismaClient() {
  try {
    return require('@prisma/client').PrismaClient;
  } catch (error) {
    throw new Error(`@prisma/client não está instalado/gerado. Execute npm install && npm run prisma:generate. Detalhe: ${error.message}`);
  }
}

function normalizeDateFields(record) {
  if (!record || typeof record !== 'object') return record;
  const output = { ...record };
  for (const key of ['createdAt', 'updatedAt', 'connectedAt', 'lastHeartbeatAt', 'scheduledAt', 'startedAt', 'finishedAt', 'sentAt', 'deliveredAt', 'readAt', 'repliedAt', 'failedAt', 'lastFailureAt', 'lastSuccessAt', 'degradedAt', 'blockedAt']) {
    if (output[key] instanceof Date) output[key] = output[key].toISOString();
  }
  return output;
}

function normalizeMany(records) {
  return records.map(normalizeDateFields);
}

function createRepositories(prisma) {
  return {
    companies: new CompanyRepository(prisma),
    users: new UserRepository(prisma),
    connections: new ConnectionRepository(prisma),
    contactLists: new ContactListRepository(prisma),
    contacts: new ContactRepository(prisma),
    templates: new TemplateRepository(prisma),
    campaigns: new CampaignRepository(prisma),
    campaignContacts: new CampaignContactRepository(prisma),
    messageJobs: new MessageJobRepository(prisma),
    messageLogs: new MessageLogRepository(prisma),
    auditLogs: new AuditLogRepository(prisma),
  };
}

function withDefaults(input, prefix) {
  return { ...input, id: input.id || createId(prefix) };
}

function createPrismaDatabase(options = {}) {
  const PrismaClient = options.PrismaClient || requirePrismaClient();
  const client = options.prisma || new PrismaClient();
  const legacy = options.legacy || createMemoryDatabase();

  function facadeFor(prisma) {
    const repos = createRepositories(prisma);
    const database = {
      driver: 'prisma',
      prisma,
      repositories: repos,
      db: legacy.db,
      createId,
      now,

      async transaction(callback) {
        return prisma.$transaction(async (tx) => callback(facadeFor(tx)));
      },

      async disconnect() {
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect();
      },

      async listCompanies() { return normalizeMany(await repos.companies.findMany()); },
      async getCompany(companyId) { return normalizeDateFields(await repos.companies.findById(requireCompanyId(companyId))); },
      async updateCompany(companyId, patch) { return normalizeDateFields(await repos.companies.update(requireCompanyId(companyId), patch)); },
      async listUsers(companyId) { return normalizeMany(await repos.users.findByCompany(companyId)); },
      async getUser(companyId, userId) { return normalizeDateFields(await repos.users.findById(companyId, userId)); },

      listLeads: (...args) => legacy.listLeads(...args),
      getLead: (...args) => legacy.getLead(...args),
      createLead: (...args) => legacy.createLead(...args),
      moveLead: (...args) => legacy.moveLead(...args),
      addLeadNote: (...args) => legacy.addLeadNote(...args),
      addLeadEvent: (...args) => legacy.addLeadEvent(...args),
      listLeadEvents: (...args) => legacy.listLeadEvents(...args),
      addScoreEvent: (...args) => legacy.addScoreEvent(...args),
      listScoreEvents: (...args) => legacy.listScoreEvents(...args),
      addTask: (...args) => legacy.addTask(...args),
      listTasks: (...args) => legacy.listTasks(...args),

      async listWhatsappConnections(companyId) { return normalizeMany(await repos.connections.findByCompany(companyId)); },
      async getWhatsappConnection(companyId, connectionId) { return normalizeDateFields(await repos.connections.findById(companyId, connectionId)); },
      async createWhatsappConnection(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.connections.create(withDefaults({
          id: input.id,
          name: input.name,
          phoneNumber: input.phoneNumber,
          status: input.status || 'qr_required',
          qrCode: input.qrCode || `attozap:${input.companyId}:${Date.now()}`,
          connectedAt: input.connectedAt || null,
          lastHeartbeatAt: input.lastHeartbeatAt || new Date(),
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
          healthState: input.healthState || 'healthy',
          sentLastHour: input.sentLastHour ?? 0,
          failedLastHour: input.failedLastHour ?? 0,
          deliveredRate: input.deliveredRate ?? 0,
          readRate: input.readRate ?? 0,
          replyRate: input.replyRate ?? 0,
          failureRate: input.failureRate ?? 0,
          consecutiveFailures: input.consecutiveFailures ?? 0,
          lastFailureAt: input.lastFailureAt || null,
          lastSuccessAt: input.lastSuccessAt || null,
          degradedAt: input.degradedAt || null,
          blockedAt: input.blockedAt || null,
          sessionPath: input.sessionPath || `storage/whatsapp-sessions/${input.companyId}/${createId('session')}`,
          companyId: input.companyId,
        }, 'wa')));
      },
      async updateWhatsappConnection(companyId, connectionId, patch) { return normalizeDateFields(await repos.connections.update(companyId, connectionId, patch)); },

      async listContactLists(companyId) { return normalizeMany(await repos.contactLists.findByCompany(companyId)); },
      async getContactList(companyId, listId) { return normalizeDateFields(await repos.contactLists.findById(companyId, listId)); },
      async createContactList(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.contactLists.create(withDefaults({ id: input.id, companyId: input.companyId, name: input.name, source: input.source || 'manual', totalContacts: 0, validContacts: 0, invalidContacts: 0, duplicateContacts: 0 }, 'list')));
      },
      async updateContactListStats(companyId, listId) {
        const contacts = await repos.contacts.findByList(companyId, listId);
        return normalizeDateFields(await repos.contactLists.update(companyId, listId, {
          totalContacts: contacts.length,
          validContacts: contacts.filter((contact) => contact.status === 'valid').length,
          invalidContacts: contacts.filter((contact) => contact.status === 'invalid').length,
          duplicateContacts: contacts.filter((contact) => contact.status === 'duplicate').length,
        }));
      },

      async listContacts(companyId, listId) { return normalizeMany(await repos.contacts.findMany(companyId, listId ? { listId } : {})); },
      async getContact(companyId, contactId) { return normalizeDateFields(await repos.contacts.findById(companyId, contactId)); },
      async findContactByPhone(companyId, phone) { return normalizeDateFields(await repos.contacts.findByCompanyPhone(companyId, phone)); },
      async createContact(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.contacts.create(withDefaults({
          id: input.id,
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
        }, 'contact')));
      },

      async listMessageTemplates(companyId) { return normalizeMany(await repos.templates.findByCompany(companyId)); },
      async getMessageTemplate(companyId, templateId) { return normalizeDateFields(await repos.templates.findById(companyId, templateId)); },
      async createMessageTemplate(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.templates.create(withDefaults({ id: input.id, companyId: input.companyId, name: input.name, body: input.body, mediaUrl: input.mediaUrl || null, variables: input.variables || ['nome', 'telefone', 'empresa'] }, 'tpl')));
      },

      async listCampaigns(companyId) { return normalizeMany(await repos.campaigns.findByCompany(companyId, { orderBy: { createdAt: 'desc' } })); },
      async getCampaign(companyId, campaignId) { return normalizeDateFields(await repos.campaigns.findById(companyId, campaignId)); },
      async createCampaign(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.campaigns.create(withDefaults({
          id: input.id,
          companyId: input.companyId,
          name: input.name,
          connectionId: input.connectionId,
          contactListId: input.contactListId,
          message: input.message,
          mediaUrl: input.mediaUrl || null,
          status: input.status || 'draft',
          totalContacts: input.totalContacts || 0,
          totalSent: input.totalSent || 0,
          totalDelivered: input.totalDelivered || 0,
          totalFailures: input.totalFailures || 0,
          totalPending: input.totalPending || 0,
          scheduledAt: input.scheduledAt || null,
          startedAt: input.startedAt || null,
          finishedAt: input.finishedAt || null,
          pauseReason: input.pauseReason || null,
        }, 'camp')));
      },
      async updateCampaign(companyId, campaignId, patch) { return normalizeDateFields(await repos.campaigns.update(companyId, campaignId, patch)); },
      async deleteCampaign(companyId, campaignId) { await repos.campaigns.delete(companyId, campaignId); return true; },

      async listCampaignContacts(companyId, campaignId) { return normalizeMany(await repos.campaignContacts.findByCampaign(companyId, campaignId)); },
      async addCampaignContact(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.campaignContacts.create(withDefaults({
          id: input.id,
          companyId: input.companyId,
          campaignId: input.campaignId,
          contactId: input.contactId,
          status: input.status || 'pending',
          providerMessageId: input.providerMessageId || null,
          providerChatId: input.providerChatId || null,
          ackStatus: input.ackStatus || null,
          deliveredAt: input.deliveredAt || null,
          readAt: input.readAt || null,
          repliedAt: input.repliedAt || null,
          failedAt: input.failedAt || null,
          lastErrorCode: input.lastErrorCode || null,
          lastErrorMessage: input.lastErrorMessage || null,
        }, 'cc')));
      },
      async updateCampaignContact(companyId, campaignId, contactId, patch) { return normalizeDateFields(await repos.campaignContacts.updateByCampaignContact(companyId, campaignId, contactId, patch)); },

      async listMessageJobs(companyId, campaignId) { return normalizeMany(await repos.messageJobs.findByCampaign(companyId, campaignId)); },
      async getMessageJob(companyId, messageJobId) { return normalizeDateFields(await repos.messageJobs.findById(companyId, messageJobId)); },
      async findMessageJobByProviderId(companyId, providerMessageId) { return normalizeDateFields(await repos.messageJobs.findByProviderMessageId(companyId, providerMessageId)); },
      async createMessageJob(input) {
        requireCompanyId(input.companyId);
        const existing = input.idempotencyKey ? await repos.messageJobs.findByIdempotencyKey(input.companyId, input.idempotencyKey) : null;
        if (existing) return normalizeDateFields(existing);
        return normalizeDateFields(await repos.messageJobs.create(withDefaults({
          id: input.id,
          companyId: input.companyId,
          campaignId: input.campaignId,
          contactId: input.contactId,
          connectionId: input.connectionId,
          message: input.message,
          mediaUrl: input.mediaUrl || null,
          status: input.status || 'pending',
          attempt: input.attempt || 0,
          maxAttempts: input.maxAttempts || 3,
          scheduledAt: input.scheduledAt || new Date(),
          queueJobId: input.queueJobId || input.idempotencyKey || null,
          idempotencyKey: input.idempotencyKey || input.queueJobId || null,
          providerMessageId: input.providerMessageId || null,
          providerChatId: input.providerChatId || null,
          ackStatus: input.ackStatus || null,
          error: input.error || null,
          startedAt: input.startedAt || null,
          sentAt: input.sentAt || null,
          deliveredAt: input.deliveredAt || null,
          readAt: input.readAt || null,
          failedAt: input.failedAt || null,
          lastErrorCode: input.lastErrorCode || null,
          lastErrorMessage: input.lastErrorMessage || null,
          retryReason: input.retryReason || null,
          retryCount: input.retryCount || 0,
        }, 'job')));
      },
      async updateMessageJob(companyId, messageJobId, patch) { return normalizeDateFields(await repos.messageJobs.update(companyId, messageJobId, patch)); },

      async listMessageLogs(companyId, filters = {}) {
        const where = { ...(filters.campaignId ? { campaignId: filters.campaignId } : {}), ...(filters.connectionId ? { connectionId: filters.connectionId } : {}) };
        return normalizeMany(await repos.messageLogs.findMany(companyId, where, { orderBy: { createdAt: 'desc' } }));
      },
      async createMessageLog(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.messageLogs.create(withDefaults({
          id: input.id,
          companyId: input.companyId,
          campaignId: input.campaignId || null,
          connectionId: input.connectionId || null,
          messageJobId: input.messageJobId || null,
          contactId: input.contactId || null,
          type: input.type,
          status: input.status || 'info',
          message: input.message || null,
          error: input.error || null,
          metadata: input.metadata || {},
        }, 'log')));
      },
      async createAuditLog(input) {
        requireCompanyId(input.companyId);
        return normalizeDateFields(await repos.auditLogs.create(withDefaults({ id: input.id, companyId: input.companyId, actorId: input.actorId || input.userId || null, action: input.action, payload: input.payload || {} }, 'audit')));
      },
      async listAuditLogs(companyId) { return normalizeMany(await repos.auditLogs.findByCompany(companyId, { orderBy: { createdAt: 'desc' } })); },

      async stats(companyId) {
        requireCompanyId(companyId);
        const [companies, users, connections, campaigns, jobs, logs] = await Promise.all([
          repos.companies.count(),
          repos.users.count(companyId),
          repos.connections.count(companyId),
          repos.campaigns.count(companyId),
          repos.messageJobs.count(companyId),
          repos.messageLogs.count(companyId),
        ]);
        return { companies, users, connections, campaigns, jobs, logs };
      },
    };
    return database;
  }

  return facadeFor(client);
}

module.exports = { createPrismaDatabase, createId, now };
