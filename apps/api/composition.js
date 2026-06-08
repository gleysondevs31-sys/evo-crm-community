const { config } = require('../../packages/config');
const { createDatabase } = require('../../packages/database');
const { createQueue } = require('../../packages/queue');
const { createAttoAiRuntime } = require('../../modules/atto-ai/runtime');
const { createCrmModule } = require('../../modules/crm');
const { createAttoZapModule } = require('../../modules/attozap');
const { createAutomationModule } = require('../../modules/automation');
const { createReportsModule } = require('../../modules/reports');
const { createGamificationModule } = require('../../modules/gamification');

function createAttoFlowApp() {
  const database = createDatabase();
  const queue = createQueue();
  const attoAi = createAttoAiRuntime();
  const crm = createCrmModule({ database, attoAi });
  const attozap = createAttoZapModule({ database, attoAi, queue });
  const automation = createAutomationModule({ database, queue, attoAi });
  const reports = createReportsModule({ database, attoAi });
  const gamification = createGamificationModule({ database });

  queue.process('campaign.dispatch', async ({ companyId, campaignId }) => ({ delivered: true, companyId, campaignId }));
  queue.process('automation.followup', async ({ companyId, leadId, taskId }) => ({ created: true, companyId, leadId, taskId }));

  return { config, database, queue, attoAi, crm, attozap, automation, reports, gamification };
}

module.exports = { createAttoFlowApp };
