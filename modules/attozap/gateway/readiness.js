const { accessSync, mkdirSync, existsSync, constants } = require('node:fs');

async function validateGatewayReadiness(config = {}) {
  const blockers = [];
  const production = config.attoEnv === 'production';
  const dryRunAllowed = config.dryRun !== false;
  if (production && !config.baileysEnabled) blockers.push('baileysDisabled');
  if (production && !config.whatsappGatewayUrl) blockers.push('gatewayUnreachable');
  if (production && dryRunAllowed) blockers.push('dryRunEnabled');
  try {
    if (!config.whatsappSessionsDir) throw new Error('missing');
    if (production && !existsSync(config.whatsappSessionsDir)) throw new Error('missing');
    mkdirSync(config.whatsappSessionsDir, { recursive: true });
    accessSync(config.whatsappSessionsDir, constants.W_OK);
  } catch (error) {
    blockers.push(error.message === 'missing' ? 'sessionDirMissing' : 'sessionDirNotWritable');
  }

  let gatewayHealth = null;
  if (config.whatsappGatewayUrl) {
    try {
      const response = await fetch(`${config.whatsappGatewayUrl.replace(/\/$/, '')}/healthz`, { signal: AbortSignal.timeout(config.gatewayTimeoutMs || 3000) });
      gatewayHealth = await response.json();
      if (!response.ok) blockers.push('gatewayUnreachable');
      if (production && gatewayHealth.provider !== 'baileys') blockers.push('invalidGatewayProvider');
      if (production && gatewayHealth.dryRun) blockers.push('dryRunEnabled');
    } catch {
      blockers.push('gatewayUnreachable');
    }
  }

  return {
    gatewayReachable: Boolean(gatewayHealth?.ok),
    gatewayProvider: gatewayHealth?.provider || null,
    baileysEnabled: Boolean(config.baileysEnabled),
    dryRunAllowed,
    sessionStorageWritable: !blockers.includes('sessionDirMissing') && !blockers.includes('sessionDirNotWritable'),
    activeGatewaySessions: gatewayHealth?.sessions || 0,
    connectedSessions: gatewayHealth?.connectedSessions || 0,
    qrRequiredSessions: gatewayHealth?.qrRequiredSessions || 0,
    productionReady: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

module.exports = { validateGatewayReadiness };
