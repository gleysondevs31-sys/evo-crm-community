const { config } = require('../../packages/config');
const { createDatabase } = require('../../packages/database');
const { createQueue } = require('../../packages/queue');
const { createAttoAiRuntime } = require('../../modules/atto-ai/runtime');
const { createCrmModule } = require('../../modules/crm');
const { createAttoZapModule } = require('../../modules/attozap');
const { createAutomationModule } = require('../../modules/automation');
const { createReportsModule } = require('../../modules/reports');
const { createGamificationModule } = require('../../modules/gamification');
const { createSeoModule } = require('../../modules/seo');
const { createAdminModule } = require('../../modules/admin');
const { createBillingModule } = require('../../modules/billing');
const { createIntegrationsModule } = require('../../modules/integrations');
const { createOmnichannelModule } = require('../../modules/omnichannel');

function createAttoFlowApp() {
  const database = createDatabase();
  const queue = createQueue();
  const attoAi = createAttoAiRuntime();
  const crm = createCrmModule({ database, attoAi });
  const attozap = createAttoZapModule({ database, attoAi, queue });
  const automation = createAutomationModule({ database, queue, attoAi });
  const reports = createReportsModule({ database, attoAi });
  const gamification = createGamificationModule({ database });
  const seo = createSeoModule({ baseUrl: process.env.ATTO_PUBLIC_URL || 'https://attoflow.com.br' });
  const admin = createAdminModule({ database, queue });
  const billing = createBillingModule();
  const integrations = createIntegrationsModule();
  const omnichannel = createOmnichannelModule();

  queue.process('campaign.dispatch', async ({ companyId, campaignId }) => ({ delivered: true, companyId, campaignId }));
  queue.process('automation.followup', async ({ companyId, leadId, taskId }) => ({ created: true, companyId, leadId, taskId }));

  return { config, database, queue, attoAi, crm, attozap, automation, reports, gamification, seo, admin, billing, integrations, omnichannel };
}

module.exports = { createAttoFlowApp };
