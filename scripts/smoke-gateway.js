const assert = require('node:assert/strict');
const { accessSync, constants } = require('node:fs');
const { GatewayClient } = require('../modules/attozap/gateway/gateway-client');

async function main() {
  if (!process.env.WHATSAPP_GATEWAY_URL) throw new Error('WHATSAPP_GATEWAY_URL obrigatório.');
  if (process.env.ATTO_BAILEYS_ENABLED !== 'true') throw new Error('ATTO_BAILEYS_ENABLED=true obrigatório para smoke:gateway.');
  const client = new GatewayClient({ attoEnv: process.env.ATTO_ENV || 'development', whatsappGatewayUrl: process.env.WHATSAPP_GATEWAY_URL, internalApiToken: process.env.INTERNAL_API_TOKEN, gatewayTimeoutMs: 10000 });
  const health = await client.health();
  assert.equal(health.provider, 'baileys');
  const connectionId = `smoke_gateway_${Date.now()}`;
  const created = await client.createSession({ companyId: process.env.ATTO_DEFAULT_COMPANY_ID || 'company_atto_demo', connectionId, name: 'Smoke Gateway' });
  const session = created.session || created;
  assert.equal(session.provider, 'baileys');
  assert.equal(Boolean(session.sessionPath), true);
  accessSync(session.sessionPath, constants.W_OK);
  assert.equal(['qr_required', 'connected', 'pending', 'reconnecting'].includes(session.status), true);
  const read = await client.getSession(connectionId);
  assert.equal((read.sessionId || read.connectionId), connectionId);
  console.log(JSON.stringify({ ok: true, health, session }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
