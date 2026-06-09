#!/usr/bin/env node
const { createAttoFlowApp } = require('../apps/api/composition');
const { reconcileAttozapDisparos } = require('../modules/attozap/reconciliation');

async function main() {
  const app = createAttoFlowApp();
  const companyId = process.env.COMPANY_ID || app.config.defaultCompanyId;
  const result = await reconcileAttozapDisparos({ database: app.database, eventBus: app.eventBus, context: { companyId, can: () => true } });
  console.log(JSON.stringify({ ok: true, companyId, result }, null, 2));
  if (typeof app.database.disconnect === 'function') await app.database.disconnect();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
