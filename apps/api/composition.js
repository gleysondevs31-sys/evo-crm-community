const { config } = require('../../packages/config');
const { createDatabase } = require('../../packages/database');
const { createQueue } = require('../../packages/queue');
const { createDisparosEventBus } = require('../../modules/attozap/event-bus');
const { recoverAttozapDisparos } = require('../../modules/attozap/recovery');
const { createAttoAiRuntime } = require('../../modules/atto-ai/runtime');
const { createCrmModule } = require('../../modules/crm');
const { createAttoZapModule } = require('../../modules/attozap');
const { createGatewayClient } = require('../../modules/attozap/gateway/gateway-client');
const { createAutomationModule } = require('../../modules/automation');
const { createReportsModule } = require('../../modules/reports');
const { createGamificationModule } = require('../../modules/gamification');
const { createSeoModule } = require('../../modules/seo');
const { createAdminModule } = require('../../modules/admin');
const { createBillingModule } = require('../../modules/billing');
const { createIntegrationsModule } = require('../../modules/integrations');
const { createOmnichannelModule } = require('../../modules/omnichannel');

function createAttoFlowApp(options = {}) {
  const database = createDatabase(config);
  const queue = createQueue(config);
  if (config.attoEnv === 'production') {
    queue.assertReady().catch((error) => { setImmediate(() => { throw error; }); });
  }
  const eventBus = createDisparosEventBus();
  const attoAi = createAttoAiRuntime();
  const gatewayClient = options.gatewayClient || createGatewayClient(config);
  const crm = createCrmModule({ database, attoAi });
  const attozap = createAttoZapModule({ database, attoAi, queue, eventBus, config, gatewayClient });
  const automation = createAutomationModule({ database, queue, attoAi });
  const reports = createReportsModule({ database, attoAi });
  const gamification = createGamificationModule({ database });
  const seo = createSeoModule({ baseUrl: process.env.ATTO_PUBLIC_URL || 'https://attoflow.com.br' });
  const admin = createAdminModule({ database, queue });
  const billing = createBillingModule();
  const integrations = createIntegrationsModule();
  const omnichannel = createOmnichannelModule();

  const registerQueueProcessors = options.registerQueueProcessors ?? queue.driver === 'memory';
  if (registerQueueProcessors) {
    queue.process('campaign.dispatch', async ({ companyId, campaignId }) => ({ delivered: true, companyId, campaignId }));
    queue.process(config.queueMessageSend, async ({ companyId, messageJobId }) => attozap.processMessageJob({ companyId, userId: config.defaultUserId, role: 'owner', can: () => true }, messageJobId));
    queue.process('automation.followup', async ({ companyId, leadId, taskId }) => ({ created: true, companyId, leadId, taskId }));
  }

  const recovery = recoverAttozapDisparos({ database, queue, eventBus, context: { companyId: config.defaultCompanyId, userId: config.defaultUserId, role: 'owner', can: () => true } });

  return { config, database, queue, eventBus, recovery, gatewayClient, attoAi, crm, attozap, automation, reports, gamification, seo, admin, billing, integrations, omnichannel };
}

module.exports = { createAttoFlowApp };
