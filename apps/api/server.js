const http = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');
const { createAttoFlowApp } = require('./composition');
const { getRequestContext, filterLeadsForContext } = require('../../packages/auth');
const { pages } = require('../../packages/config/routes');
const { schema, sensitiveTables } = require('../../packages/database/schema');
const { validateGatewayReadiness } = require('../../modules/attozap/gateway/readiness');
const { logger } = require('../../packages/logger');
const { attachCorrelation } = require('../../packages/correlation');

const app = createAttoFlowApp();
const startedAt = new Date();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, content, status = 200) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(content);
}

function sendText(res, status, content, contentType = 'text/plain') {
  res.writeHead(status, { 'content-type': `${contentType}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(content);
}

function sendEventStream(req, res, app, ctx, payload) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  const writeEvent = (event) => {
    res.write(`event: ${event.type || 'snapshot'}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  writeEvent({ type: 'snapshot', companyId: ctx.companyId, payload, timestamp: new Date().toISOString() });
  const unsubscribe = app.eventBus.subscribe(ctx.companyId, writeEvent);
  const keepAlive = setInterval(() => writeEvent({ type: 'heartbeat', companyId: ctx.companyId, payload: { ok: true }, timestamp: new Date().toISOString() }), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}

function sendStatic(res, filePath) {
  const types = { '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.html': 'text/html' };
  res.writeHead(200, { 'content-type': `${types[extname(filePath)] || 'text/plain'}; charset=utf-8` });
  res.end(readFileSync(filePath));
}

function context(req) {
  return getRequestContext(req, app.database);
}

function prometheusLine(name, value, labels = {}) {
  const labelPairs = Object.entries(labels).filter(([, val]) => val !== undefined && val !== null).map(([key, val]) => `${key}="${String(val).replace(/"/g, '\\"')}"`);
  return `${name}${labelPairs.length ? `{${labelPairs.join(',')}}` : ''} ${Number(value || 0)}`;
}

async function collectDisparosOps(app, ctx) {
  const [queueHealth, gatewayHealth, connections, campaigns, logs] = await Promise.all([
    app.queue.health(),
    validateGatewayReadiness(app.config),
    app.attozap.listConnections(ctx),
    app.attozap.listCampaigns(ctx),
    app.attozap.listLogs(ctx),
  ]);
  const allJobs = (await Promise.all(campaigns.map((campaign) => app.database.listMessageJobs(ctx.companyId, campaign.id)))).flat();
  const health = connections.reduce((acc, connection) => {
    const score = Number(connection.healthScore ?? 100);
    acc.totalScore += score;
    if ((connection.healthState || 'healthy') === 'blocked' || connection.status === 'blocked') acc.blocked += 1;
    else if (score < 30) acc.critical += 1;
    else if (score < 60) acc.degraded += 1;
    else if (score < 80) acc.watch += 1;
    else acc.healthy += 1;
    return acc;
  }, { healthy: 0, watch: 0, degraded: 0, critical: 0, blocked: 0, totalScore: 0 });
  const ops = {
    queueHealth,
    gatewayHealth,
    connections,
    campaigns,
    logs,
    allJobs,
    blockers: [...new Set([...(queueHealth.blockers || []), ...(gatewayHealth.blockers || [])])],
    connectionsHealthy: health.healthy,
    connectionsWatch: health.watch,
    connectionsDegraded: health.degraded,
    connectionsCritical: health.critical,
    connectionsBlocked: health.blocked,
    averageHealthScore: connections.length ? Math.round(health.totalScore / connections.length) : 100,
    messagesSent: allJobs.filter((job) => ['sent', 'delivered', 'read'].includes(job.status)).length,
    messagesFailed: allJobs.filter((job) => ['failed', 'blocked'].includes(job.status)).length,
    messagesDelivered: allJobs.filter((job) => ['delivered', 'read'].includes(job.status)).length,
    messagesRead: allJobs.filter((job) => job.status === 'read').length,
    messagesReplied: (await Promise.all(campaigns.map((campaign) => app.database.listCampaignContacts(ctx.companyId, campaign.id)))).flat().filter((item) => item.status === 'replied').length,
    pendingAcks: allJobs.filter((job) => job.status === 'sent' && job.providerMessageId && !job.deliveredAt && !job.readAt).length,
    stuckJobs: allJobs.filter((job) => ['sending', 'retrying'].includes(job.status)).length,
  };
  ops.openAlerts = app.alerts.evaluate({ companyId: ctx.companyId, health: ops, queue: queueHealth, gateway: gatewayHealth });
  return ops;
}

async function renderPrometheusMetrics(app, ctx) {
  const ops = await collectDisparosOps(app, ctx);
  const labels = { environment: app.config.attoEnv, companyId: ctx.companyId };
  const lines = [
    '# HELP attozap_campaigns_running Running campaigns', '# TYPE attozap_campaigns_running gauge',
    prometheusLine('attozap_campaigns_running', ops.campaigns.filter((c) => c.status === 'running').length, labels),
    prometheusLine('attozap_campaigns_paused', ops.campaigns.filter((c) => c.status === 'paused').length, labels),
    prometheusLine('attozap_campaigns_completed', ops.campaigns.filter((c) => c.status === 'completed').length, labels),
    prometheusLine('attozap_messages_sent_total', ops.messagesSent, labels),
    prometheusLine('attozap_messages_failed_total', ops.messagesFailed, labels),
    prometheusLine('attozap_messages_delivered_total', ops.messagesDelivered, labels),
    prometheusLine('attozap_messages_read_total', ops.messagesRead, labels),
    prometheusLine('attozap_messages_replied_total', ops.messagesReplied, labels),
    prometheusLine('attozap_queue_waiting', ops.queueHealth.waiting || ops.queueHealth.queued || 0, labels),
    prometheusLine('attozap_queue_active', ops.queueHealth.active || ops.queueHealth.running || 0, labels),
    prometheusLine('attozap_queue_failed', ops.queueHealth.failed || 0, labels),
    prometheusLine('attozap_connections_connected', ops.connections.filter((c) => c.status === 'connected').length, labels),
    prometheusLine('attozap_connections_degraded', ops.connectionsDegraded, labels),
    prometheusLine('attozap_connections_blocked', ops.connectionsBlocked, labels),
    ...ops.connections.map((connection) => prometheusLine('attozap_connection_health_score', connection.healthScore ?? 100, { environment: app.config.attoEnv, companyId: ctx.companyId, connectionId: connection.id, status: connection.status })),
    prometheusLine('attozap_gateway_up', ops.gatewayHealth.gatewayReachable ? 1 : 0, labels),
    prometheusLine('attozap_redis_up', ops.queueHealth.redisConnected ? 1 : 0, labels),
    prometheusLine('attozap_database_up', app.database ? 1 : 0, labels),
    prometheusLine('attozap_worker_up', (ops.queueHealth.workers || 0) > 0 ? 1 : 0, labels),
  ];
  return lines.join('\n') + '\n';
}

async function route(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const correlationId = attachCorrelation(req, res);
  const ctx = context(req);
  ctx.correlationId = correlationId;
  ctx.ip = req.socket?.remoteAddress;
  ctx.userAgent = req.headers['user-agent'];


  const internalMatch = url.pathname.match(/^\/api\/internal\/whatsapp\/connections\/([^/]+)\/(status|qr|heartbeat|log)$/);
  if (internalMatch && req.method === 'POST') {
    const auth = req.headers.authorization || '';
    if (!app.config.internalApiToken || auth !== `Bearer ${app.config.internalApiToken}`) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const [, connectionId, action] = internalMatch;
    const body = await readBody(req);
    if (!body.companyId) return sendJson(res, 400, { ok: false, error: 'companyId_required' });
    if (action === 'status' || action === 'heartbeat') {
      const patch = { lastHeartbeatAt: new Date().toISOString() };
      if (body.status) patch.status = body.status;
      if (body.sessionPath) patch.sessionPath = body.sessionPath;
      if (body.qrCode) patch.qrCode = body.qrCode;
      if (body.status === 'connected') patch.connectedAt = patch.lastHeartbeatAt;
      const connection = await app.database.updateWhatsappConnection(body.companyId, connectionId, patch);
      await app.database.createMessageLog({ companyId: body.companyId, connectionId, type: `gateway.${action}`, status: 'info', message: body.status || action, metadata: body });
      app.eventBus.publish({ type: `gateway.${action}`, companyId: body.companyId, connectionId, payload: { connection } });
      return sendJson(res, 200, { ok: true, connection });
    }
    if (action === 'qr') {
      const connection = await app.database.updateWhatsappConnection(body.companyId, connectionId, { status: 'qr_required', qrCode: body.qrCode, sessionPath: body.sessionPath });
      await app.database.createMessageLog({ companyId: body.companyId, connectionId, type: 'gateway.qr', status: 'info', message: body.qrCode, metadata: body });
      app.eventBus.publish({ type: 'gateway.qr', companyId: body.companyId, connectionId, payload: { qrCode: body.qrCode } });
      return sendJson(res, 200, { ok: true, connection });
    }
    await app.database.createMessageLog({ companyId: body.companyId, connectionId, type: body.type || 'gateway.log', status: body.status || 'info', message: body.message, error: body.error, metadata: body });
    app.eventBus.publish({ type: body.type || 'gateway.log', companyId: body.companyId, connectionId, payload: body });
    return sendJson(res, 200, { ok: true });
  }



  const messageInternalMatch = url.pathname.match(/^\/api\/internal\/whatsapp\/messages\/(ack|inbound)$/);
  if (messageInternalMatch && req.method === 'POST') {
    const auth = req.headers.authorization || '';
    if (!app.config.internalApiToken || auth !== `Bearer ${app.config.internalApiToken}`) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const [, action] = messageInternalMatch;
    const body = await readBody(req);
    if (!body.companyId) return sendJson(res, 400, { ok: false, error: 'companyId_required' });
    const internalContext = { companyId: body.companyId, user: { role: 'owner' }, can: () => true, correlationId: body.correlationId || correlationId };
    if (action === 'ack') {
      if (!body.providerMessageId) return sendJson(res, 400, { ok: false, error: 'providerMessageId_required' });
      const result = await app.attozap.handleMessageAck(internalContext, body);
      return sendJson(res, 200, result);
    }
    const result = await app.attozap.handleInboundMessage(internalContext, body);
    return sendJson(res, 200, result);
  }

  if (url.pathname === '/sitemap.xml') {
    return sendText(res, 200, app.seo.sitemap(), 'application/xml');
  }

  if (url.pathname === '/robots.txt') {
    return sendText(res, 200, app.seo.robots());
  }

  if (isKnownPage(url.pathname)) {
    const indexPath = join(process.cwd(), 'apps/web/index.html');
    return sendHtml(res, await renderPage(readFileSync(indexPath, 'utf8'), url.pathname, ctx));
  }

  if (url.pathname.startsWith('/assets/')) {
    const filePath = join(process.cwd(), 'apps/web', url.pathname);
    if (existsSync(filePath)) return sendStatic(res, filePath);
  }

  if (url.pathname === '/metrics') {
    return sendText(res, 200, await renderPrometheusMetrics(app, ctx));
  }

  if (url.pathname === '/healthz' || url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'atto-flow-api',
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    });
  }

  if (url.pathname === '/api/pages') {
    return sendJson(res, 200, { pages });
  }

  if (url.pathname === '/api/seo') {
    return sendJson(res, 200, app.seo.metadata(url.searchParams.get('path') || '/'));
  }

  if (url.pathname === '/api/schema') {
    return sendJson(res, 200, { schema, sensitiveTables });
  }

  if (url.pathname === '/api/status') {
    return sendJson(res, 200, {
      name: app.config.appName,
      mode: 'attozap-disparos-mvp',
      company: await app.database.getCompany(ctx.companyId),
      modules: ['attozap-disparos'],
    });
  }

  if (url.pathname === '/api/dashboard') {
    return sendJson(res, 200, await app.reports.dashboard(ctx));
  }

  if (url.pathname === '/api/disparos/events') {
    return sendEventStream(req, res, app, ctx, {
      campaigns: await app.attozap.listCampaigns(ctx),
      connections: await app.attozap.listConnections(ctx),
      queue: await app.queue.list({ type: app.config.queueMessageSend }),
      logs: (await app.attozap.listLogs(ctx)).slice(-25),
    });
  }

  if (url.pathname === '/api/disparos/health') {
    const queueHealth = await app.queue.health();
    const gatewayHealth = await validateGatewayReadiness(app.config);
    const connections = await app.attozap.listConnections(ctx);
    const campaigns = await app.attozap.listCampaigns(ctx);
    const blockers = [...new Set([...(queueHealth.blockers || []), ...(gatewayHealth.blockers || [])])];
    const connectionHealth = connections.reduce((acc, connection) => {
      const score = Number(connection.healthScore ?? 100);
      acc.totalScore += score;
      if ((connection.healthState || 'healthy') === 'blocked' || connection.status === 'blocked') acc.blocked += 1;
      else if (score < 30) acc.critical += 1;
      else if (score < 60) acc.degraded += 1;
      else acc.healthy += 1;
      return acc;
    }, { healthy: 0, degraded: 0, critical: 0, blocked: 0, totalScore: 0 });
    const allJobs = (await Promise.all(campaigns.map((campaign) => app.database.listMessageJobs(ctx.companyId, campaign.id)))).flat();
    const sentOrBetter = allJobs.filter((job) => ['sent', 'delivered', 'read'].includes(job.status)).length;
    const deliveredOrRead = allJobs.filter((job) => ['delivered', 'read'].includes(job.status)).length;
    const failedJobs = allJobs.filter((job) => ['failed', 'blocked'].includes(job.status)).length;
    const pendingAcks = allJobs.filter((job) => job.status === 'sent' && job.providerMessageId && !job.deliveredAt && !job.readAt).length;
    const stuckJobs = allJobs.filter((job) => ['sending', 'retrying'].includes(job.status)).length;
    return sendJson(res, 200, {
      queueDriver: queueHealth.queueDriver,
      redis: queueHealth.redis,
      redisConnected: queueHealth.redisConnected,
      queueName: queueHealth.queueName,
      waiting: queueHealth.waiting || queueHealth.queued || 0,
      delayed: queueHealth.delayed || 0,
      active: queueHealth.active || queueHealth.running || 0,
      failed: queueHealth.failed || 0,
      completed: queueHealth.completed || 0,
      paused: queueHealth.paused || 0,
      workers: queueHealth.workers || 0,
      failedJobs: queueHealth.failedJobs || [],
      productionReady: Boolean(queueHealth.productionReady && gatewayHealth.productionReady),
      blockers,
      gatewayReachable: gatewayHealth.gatewayReachable,
      gatewayProvider: gatewayHealth.gatewayProvider,
      baileysEnabled: gatewayHealth.baileysEnabled,
      dryRunAllowed: gatewayHealth.dryRunAllowed,
      activeGatewaySessions: gatewayHealth.activeGatewaySessions,
      connectedSessions: gatewayHealth.connectedSessions,
      qrRequiredSessions: gatewayHealth.qrRequiredSessions,
      sessionStorageWritable: gatewayHealth.sessionStorageWritable,
      queue: queueHealth,
      connectedConnections: connections.filter((connection) => connection.status === 'connected').length,
      runningCampaigns: campaigns.filter((campaign) => campaign.status === 'running').length,
      recovered: await app.recovery,
      connectionsHealthy: connectionHealth.healthy,
      connectionsDegraded: connectionHealth.degraded,
      connectionsCritical: connectionHealth.critical,
      connectionsBlocked: connectionHealth.blocked,
      averageHealthScore: connections.length ? Math.round(connectionHealth.totalScore / connections.length) : 100,
      deliveryRate: sentOrBetter ? Number((deliveredOrRead / sentOrBetter).toFixed(2)) : 0,
      failureRate: allJobs.length ? Number((failedJobs / allJobs.length).toFixed(2)) : 0,
      pendingAcks,
      stuckJobs,
      campaignsAutoPaused: campaigns.filter((campaign) => campaign.status === 'paused' && campaign.pauseReason).length,
      recentConnectionRisks: (await app.attozap.listLogs(ctx)).filter((log) => ['connection.degraded', 'connection.blocked'].includes(log.type)).slice(0, 10),
    });
  }


  if (url.pathname === '/api/disparos/alerts') {
    return sendJson(res, 200, { alerts: app.alerts.list({ companyId: ctx.companyId }) });
  }

  const resolveAlertMatch = url.pathname.match(/^\/api\/disparos\/alerts\/([^/]+)\/resolve$/);
  if (resolveAlertMatch && req.method === 'POST') {
    const alert = app.alerts.resolve(resolveAlertMatch[1], { correlationId: ctx.correlationId, userId: ctx.userId });
    if (!alert) return sendJson(res, 404, { ok: false, error: 'alert_not_found' });
    await app.database.createAuditLog({ companyId: ctx.companyId, userId: ctx.userId, action: 'resolve alert', entityType: 'alert', entityId: alert.id, payload: { alert, correlationId: ctx.correlationId, ip: ctx.ip, userAgent: ctx.userAgent } });
    return sendJson(res, 200, { ok: true, alert });
  }

  if (url.pathname === '/api/disparos/ops-dashboard') {
    const ops = await collectDisparosOps(app, ctx);
    const criticalLogs = ops.logs.filter((log) => ['connection.blocked', 'connection.degraded', 'message.failed', 'message.retrying'].includes(log.type)).slice(0, 20);
    return sendJson(res, 200, {
      health: { productionReady: Boolean(ops.queueHealth.productionReady && ops.gatewayHealth.productionReady), checkedAt: new Date().toISOString() },
      blockers: ops.blockers,
      campaigns: { running: ops.campaigns.filter((c) => c.status === 'running').length, paused: ops.campaigns.filter((c) => c.status === 'paused').length, stuck: ops.stuckJobs },
      connections: { healthy: ops.connectionsHealthy, watch: ops.connectionsWatch, degraded: ops.connectionsDegraded, critical: ops.connectionsCritical, blocked: ops.connectionsBlocked, averageHealthScore: ops.averageHealthScore },
      queue: ops.queueHealth,
      gateway: ops.gatewayHealth,
      redis: { connected: ops.queueHealth.redisConnected },
      database: { driver: app.database.driver, up: true },
      alerts: ops.openAlerts,
      criticalLogs,
      recommendations: ops.blockers.length ? ['Resolver blockers antes de executar disparos em produção.'] : ['Operação pronta para monitoramento contínuo.'],
    });
  }

  if (url.pathname === '/api/disparos/readiness') {
    const ops = await collectDisparosOps(app, ctx);
    const criticalAlerts = ops.openAlerts.filter((alert) => alert.severity === 'critical' && alert.status === 'open');
    const warnings = ops.openAlerts.filter((alert) => alert.severity !== 'critical').map((alert) => alert.type);
    const ready = ops.blockers.length === 0 && criticalAlerts.length === 0 && Boolean(ops.queueHealth.productionReady && ops.gatewayHealth.productionReady);
    return sendJson(res, 200, { ready, environment: app.config.attoEnv, database: { ok: true, driver: app.database.driver }, redis: { ok: Boolean(ops.queueHealth.redisConnected) }, queue: { ok: Boolean(ops.queueHealth.productionReady), driver: ops.queueHealth.queueDriver }, worker: { ok: (ops.queueHealth.workers || 0) > 0 || app.queue.driver === 'memory' }, gateway: { ok: Boolean(ops.gatewayHealth.gatewayReachable), provider: ops.gatewayHealth.gatewayProvider }, baileys: { ok: Boolean(ops.gatewayHealth.baileysEnabled) }, sessionStorage: { ok: Boolean(ops.gatewayHealth.sessionStorageWritable) }, alerts: { open: ops.openAlerts.length, critical: criticalAlerts.length }, blockers: ops.blockers, warnings, checkedAt: new Date().toISOString() });
  }

  if (url.pathname === '/api/disparos/overview') {
    const campaigns = await app.attozap.listCampaigns(ctx);
    const connections = await app.attozap.listConnections(ctx);
    const logs = await app.attozap.listLogs(ctx);
    return sendJson(res, 200, {
      campaigns: campaigns.length,
      running: campaigns.filter((campaign) => campaign.status === 'running').length,
      paused: campaigns.filter((campaign) => campaign.status === 'paused').length,
      sent: campaigns.reduce((sum, campaign) => sum + campaign.totalSent, 0),
      failures: campaigns.reduce((sum, campaign) => sum + campaign.totalFailures, 0),
      connected: connections.filter((connection) => connection.status === 'connected').length,
      recentLogs: logs.slice(-10),
    });
  }

  if (url.pathname === '/api/disparos/conexoes') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 201, { connection: await app.attozap.createConnection(ctx, body) });
    }
    return sendJson(res, 200, { connections: await app.attozap.listConnections(ctx) });
  }

  const connectionStatusMatch = url.pathname.match(/^\/api\/disparos\/conexoes\/([^/]+)\/status$/);
  if (connectionStatusMatch && req.method === 'POST') {
    const body = await readBody(req);
    return sendJson(res, 200, { connection: await app.attozap.updateConnectionStatus(ctx, connectionStatusMatch[1], body.status) });
  }

  if (url.pathname === '/api/disparos/listas') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 201, { list: await app.attozap.createContactList(ctx, body) });
    }
    return sendJson(res, 200, { lists: await app.attozap.listContactLists(ctx) });
  }

  const listContactsMatch = url.pathname.match(/^\/api\/disparos\/listas\/([^/]+)\/contatos$/);
  if (listContactsMatch) {
    return sendJson(res, 200, { contacts: await app.attozap.listContacts(ctx, listContactsMatch[1]) });
  }

  if (url.pathname === '/api/disparos/templates') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 201, { template: await app.attozap.createTemplate(ctx, body) });
    }
    return sendJson(res, 200, { templates: await app.attozap.listTemplates(ctx) });
  }

  if (url.pathname === '/api/disparos/preview') {
    const body = req.method === 'POST' ? await readBody(req) : { message: url.searchParams.get('message') || '' };
    return sendJson(res, 200, await app.attozap.previewMessage(ctx, body));
  }

  if (url.pathname === '/api/disparos/campanhas') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 201, { campaign: await app.attozap.createCampaign(ctx, body) });
    }
    return sendJson(res, 200, { campaigns: await app.attozap.listCampaigns(ctx) });
  }

  const campaignMatch = url.pathname.match(/^\/api\/disparos\/campanhas\/([^/]+)$/);
  if (campaignMatch) {
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      return sendJson(res, 200, { campaign: await app.attozap.updateCampaign(ctx, campaignMatch[1], body) });
    }
    if (req.method === 'DELETE') {
      return sendJson(res, 200, { deleted: await app.attozap.deleteCampaign(ctx, campaignMatch[1]) });
    }
    return sendJson(res, 200, { campaign: await app.attozap.getCampaign(ctx, campaignMatch[1]) });
  }

  const campaignActionMatch = url.pathname.match(/^\/api\/disparos\/campanhas\/([^/]+)\/(start|pause|resume|cancel|duplicate)$/);
  if (campaignActionMatch && req.method === 'POST') {
    const [, campaignId, action] = campaignActionMatch;
    const handlers = {
      start: () => app.attozap.startCampaign(ctx, campaignId),
      pause: () => app.attozap.pauseCampaign(ctx, campaignId),
      resume: () => app.attozap.resumeCampaign(ctx, campaignId),
      cancel: () => app.attozap.cancelCampaign(ctx, campaignId),
      duplicate: () => app.attozap.duplicateCampaign(ctx, campaignId),
    };
    return sendJson(res, 200, { campaign: await handlers[action]() });
  }

  const campaignLogsMatch = url.pathname.match(/^\/api\/disparos\/campanhas\/([^/]+)\/logs$/);
  if (campaignLogsMatch) {
    return sendJson(res, 200, { logs: await app.attozap.listLogs(ctx, { campaignId: campaignLogsMatch[1] }) });
  }

  if (url.pathname === '/api/crm/stages') {
    return sendJson(res, 200, { stages: app.crm.stages });
  }

  if (url.pathname === '/api/crm/leads' && req.method === 'GET') {
    return sendJson(res, 200, { leads: filterLeadsForContext(app.crm.listLeads(ctx), ctx) });
  }

  if (url.pathname === '/api/crm/leads' && req.method === 'POST') {
    const body = await readBody(req);
    return sendJson(res, 201, { lead: app.crm.createLead(ctx, body) });
  }

  const leadMoveMatch = url.pathname.match(/^\/api\/crm\/leads\/([^/]+)\/move$/);
  if (leadMoveMatch && req.method === 'POST') {
    const body = await readBody(req);
    return sendJson(res, 200, { lead: app.crm.moveLead(ctx, leadMoveMatch[1], body.stage) });
  }

  const leadSummaryMatch = url.pathname.match(/^\/api\/crm\/leads\/([^/]+)\/summary$/);
  if (leadSummaryMatch) {
    return sendJson(res, 200, { summary: app.crm.summarizeLead(ctx, leadSummaryMatch[1]) });
  }

  const leadNextActionMatch = url.pathname.match(/^\/api\/crm\/leads\/([^/]+)\/next-action$/);
  if (leadNextActionMatch) {
    return sendJson(res, 200, { nextAction: app.crm.nextAction(ctx, leadNextActionMatch[1]) });
  }

  if (url.pathname === '/api/attozap/connections') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 201, { connection: await app.attozap.createConnection(ctx, body) });
    }
    return sendJson(res, 200, { connections: await app.attozap.listConnections(ctx) });
  }

  if (url.pathname === '/api/attozap/inbox') {
    return sendJson(res, 200, { conversations: await app.attozap.inbox(ctx) });
  }

  const suggestReplyMatch = url.pathname.match(/^\/api\/attozap\/leads\/([^/]+)\/suggest-reply$/);
  if (suggestReplyMatch) {
    return sendJson(res, 200, { suggestion: await app.attozap.suggestReply(ctx, suggestReplyMatch[1]) });
  }

  if (url.pathname === '/api/attozap/campaigns') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 201, { campaign: await app.attozap.createCampaign(ctx, body) });
    }
    return sendJson(res, 200, { campaigns: await app.database.listCampaigns(ctx.companyId) });
  }

  const automationLeadMatch = url.pathname.match(/^\/api\/automation\/leads\/([^/]+)\/entered$/);
  if (automationLeadMatch && req.method === 'POST') {
    return sendJson(res, 201, app.automation.triggerLeadEntered(ctx, automationLeadMatch[1]));
  }

  if (url.pathname === '/api/automation/tasks') {
    return sendJson(res, 200, { tasks: app.automation.listTasks(ctx) });
  }

  if (url.pathname === '/api/gamification/ranking') {
    return sendJson(res, 200, { ranking: app.gamification.ranking(ctx) });
  }

  if (url.pathname === '/api/admin/companies') {
    return sendJson(res, 200, { companies: await app.admin.companies() });
  }

  if (url.pathname === '/api/admin/system-health') {
    return sendJson(res, 200, await app.admin.systemHealth(ctx));
  }

  if (url.pathname === '/api/billing/plans') {
    return sendJson(res, 200, { plans: app.billing.plans() });
  }

  if (url.pathname === '/api/billing/subscription') {
    return sendJson(res, 200, app.billing.currentSubscription(await app.database.getCompany(ctx.companyId)));
  }

  if (url.pathname === '/api/integrations') {
    return sendJson(res, 200, { integrations: app.integrations.list() });
  }

  if (url.pathname === '/api/omnichannel/channels') {
    return sendJson(res, 200, { channels: app.omnichannel.channels() });
  }

  if (url.pathname === '/api/atto-ai/logs') {
    return sendJson(res, 200, { logs: app.attoAi.usageLogs(ctx.companyId) });
  }

  if (url.pathname === '/api/queue') {
    if (req.method === 'POST') {
      const drained = await app.queue.drain();
      return sendJson(res, 200, { jobs: drained });
    }
    return sendJson(res, 200, { jobs: await app.queue.list() });
  }

  if (url.pathname.startsWith('/api/')) {
    return sendJson(res, 404, { ok: false, error: 'not_found' });
  }

  const indexPath = join(process.cwd(), 'apps/web/index.html');
  return sendHtml(res, await renderPage(readFileSync(indexPath, 'utf8'), '/404', ctx), 404);
}


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function renderInitialContent(pathname, ctx) {
  if (pathname === '/') {
    const dashboard = await app.reports.dashboard(ctx);
    const inbox = await app.attozap.inbox(ctx);
    const plans = app.billing.plans();
    const metrics = [
      ['Leads', dashboard.totalLeads],
      ['Conversas', dashboard.activeConversations],
      ['Conexões', dashboard.connectionsOnline],
      ['Campanhas', dashboard.campaigns],
    ]
      .map(([label, value]) => `<div class="card"><div class="eyebrow">${escapeHtml(label)}</div><h3>${escapeHtml(value)}</h3></div>`)
      .join('');
    const inboxHtml = inbox
      .map((conversation) => `<div class="lead-card"><strong>${escapeHtml(conversation.leadName)}</strong><p>${escapeHtml(conversation.preview)}</p></div>`)
      .join('');
    const features = ['ATTOZAP', 'CRM', 'AUTOMAÇÃO', 'ATTO AI', 'RELATÓRIOS', 'GAMIFICAÇÃO', 'OMNICHANNEL', 'ADMIN ENTERPRISE']
      .map((name, index) => `<div class="card"><div class="eyebrow">0${index + 1}</div><h3>${name}</h3><p>${escapeHtml(plans[index % plans.length].name)} ready · modular · escalável.</p></div>`)
      .join('');

    return `
      <section class="hero">
        <div class="eyebrow">SaaS enterprise para operação comercial</div>
        <h1>Venda, atenda e automatize com <span class="gradient">ATTO FLOW</span>.</h1>
        <p class="lead">Substitua planilhas, WhatsApp bagunçado e processos manuais por CRM, multiatendimento, campanhas, automação, relatórios, gamificação e ATTO AI em uma única plataforma.</p>
        <div class="hero-actions"><a class="btn primary" href="/demo">Agendar demonstração</a><a class="btn" href="/app/dashboard">Ver produto</a></div>
        <div class="panel product-shot"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><div class="shot-grid"><div class="sidebar"><strong>Inbox compartilhada</strong><p>WhatsApp, CRM e automações por equipe.</p><div id="mini-inbox">${inboxHtml}</div></div><div class="screen"><strong>Dashboard operacional</strong><div id="mini-metrics" class="metric-grid">${metrics}</div></div></div></div>
      </section>
      <section><h2>Módulos para operar de ponta a ponta</h2><div class="feature-grid" id="features">${features}</div></section>
      <section class="compare"><div class="card"><h3>Sem planilhas</h3><p>Pipeline, histórico, tarefas e relatórios centralizados.</p></div><div class="card"><h3>Sem WhatsApp perdido</h3><p>Conexões, inbox, campanhas, filas e atendimento por equipe.</p></div><div class="card"><h3>Com IA interna</h3><p>Resumos, classificação, sugestões, RAG e análise de performance.</p></div></section>
      <section><h2>FAQ</h2><div class="feature-grid"><div class="card"><h3>É só CRM?</h3><p>Não. CRM é um módulo dentro da ATTO FLOW, junto com ATTOZAP, automações, relatórios, gamificação e ATTO AI.</p></div><div class="card"><h3>Funciona com WhatsApp?</h3><p>A arquitetura prevê Baileys, múltiplos números, filas, QR Code, reconexão e webhooks.</p></div><div class="card"><h3>É multiempresa?</h3><p>Sim. Todo dado sensível usa contexto de empresa e RBAC.</p></div></div></section>`;
  }

  if (pathname.startsWith('/app')) {
    const dashboard = await app.reports.dashboard(ctx);
    const stages = app.crm.stages;
    const leads = filterLeadsForContext(app.crm.listLeads(ctx), ctx);
    const inbox = await app.attozap.inbox(ctx);
    const health = await app.admin.systemHealth(ctx);
    const menu = ['/app/disparos','/app/disparos/nova','/app/conexoes','/app/conexoes/nova','/app/listas','/app/listas/nova','/app/templates','/app/dashboard','/app/admin/system-health']
      .map((href) => `<a href="${href}">${escapeHtml(href.replace('/app/','').replaceAll('/',' · '))}</a>`)
      .join('');
    let content = `<div class="metric-grid">${[['Leads',dashboard.totalLeads],['Conversas',dashboard.activeConversations],['Conversão',`${dashboard.conversionRate}%`],['Saúde',health.status]].map(([k,v]) => `<div class="card"><div class="eyebrow">${escapeHtml(k)}</div><h2>${escapeHtml(v)}</h2></div>`).join('')}</div><div class="card"><h3>Insight</h3><p>${escapeHtml(dashboard.aiInsight)}</p></div>`;

    if (pathname.includes('disparos')) {
      const campaigns = await app.attozap.listCampaigns(ctx);
      content = `<div class="metric-grid">${[['Campanhas',campaigns.length],['Rodando',campaigns.filter((campaign) => campaign.status === 'running').length],['Enviadas',campaigns.reduce((sum, campaign) => sum + campaign.totalSent, 0)],['Falhas',campaigns.reduce((sum, campaign) => sum + campaign.totalFailures, 0)]].map(([k,v]) => `<div class="card"><div class="eyebrow">${escapeHtml(k)}</div><h2>${escapeHtml(v)}</h2></div>`).join('')}</div><div class="feature-grid">${campaigns.map((campaign) => `<div class="card"><div class="eyebrow">${escapeHtml(campaign.status)}</div><h3>${escapeHtml(campaign.name)}</h3><p>${escapeHtml(campaign.totalSent)} enviados · ${escapeHtml(campaign.totalFailures)} falhas · ${escapeHtml(campaign.totalPending)} pendentes</p><div class="hero-actions"><button onclick="campaignAction('${campaign.id}','start')">Iniciar</button><button onclick="campaignAction('${campaign.id}','pause')">Pausar</button><button onclick="campaignAction('${campaign.id}','resume')">Retomar</button><button onclick="campaignAction('${campaign.id}','cancel')">Cancelar</button></div><a href="/app/disparos/${campaign.id}/logs">Ver logs</a></div>`).join('')}</div>`;
    } else if (pathname.includes('conexoes')) {
      const connections = await app.attozap.listConnections(ctx);
      content = `<div class="feature-grid">${connections.map((connection) => `<div class="card"><div class="eyebrow">${escapeHtml(connection.status)}</div><h3>${escapeHtml(connection.name)}</h3><p>${escapeHtml(connection.phoneNumber)} · ${escapeHtml(connection.messagesSent)} enviadas · ${escapeHtml(connection.totalFailures)} falhas</p><p>Limites: ${escapeHtml(connection.hourlyLimit)}/hora · ${escapeHtml(connection.dailyLimit)}/dia</p><code>${escapeHtml(connection.qrCode || 'conectado')}</code></div>`).join('')}</div>`;
    } else if (pathname.includes('listas')) {
      const lists = await app.attozap.listContactLists(ctx);
      content = `<div class="feature-grid">${lists.map((list) => `<div class="card"><h3>${escapeHtml(list.name)}</h3><p>${escapeHtml(list.validContacts)} válidos · ${escapeHtml(list.invalidContacts)} inválidos · ${escapeHtml(list.duplicateContacts)} duplicados</p><p>${escapeHtml(list.source)}</p></div>`).join('')}</div>`;
    } else if (pathname.includes('templates')) {
      const templates = await app.attozap.listTemplates(ctx);
      content = `<div class="feature-grid">${templates.map((template) => `<div class="card"><h3>${escapeHtml(template.name)}</h3><p>${escapeHtml(template.body)}</p><div class="eyebrow">${escapeHtml(template.variables.join(', '))}</div></div>`).join('')}</div>`;
    } else if (pathname.includes('pipeline') || pathname.includes('crm')) {
      content = `<div class="kanban">${stages.slice(0, 8).map((stage) => `<div class="card"><h3>${escapeHtml(stage)}</h3>${leads.filter((lead) => lead.stage === stage).map((lead) => `<div class="lead-card"><strong>${escapeHtml(lead.name)}</strong><p>${escapeHtml(lead.origin)} · score ${escapeHtml(lead.score)}</p><button onclick="suggest('${lead.id}')">ATTO AI</button></div>`).join('') || '<p>Sem leads</p>'}</div>`).join('')}</div>`;
    } else if (pathname.includes('inbox') || pathname.includes('whatsapp')) {
      content = `<div class="feature-grid">${inbox.map((conversation) => `<div class="card"><h3>${escapeHtml(conversation.leadName)}</h3><p>${escapeHtml(conversation.phone)}</p><p>${escapeHtml(conversation.preview)}</p></div>`).join('')}</div>`;
    } else if (pathname.includes('ai')) {
      content = `<pre>${escapeHtml(JSON.stringify(app.attoAi.usageLogs(ctx.companyId), null, 2))}</pre>`;
    }

    return `<div class="app-layout"><aside class="panel app-menu"><strong>ATTOZAP DISPAROS</strong>${menu}</aside><section><div class="card"><div class="eyebrow">${escapeHtml(pathname)}</div><h1 style="font-size:54px">${escapeHtml(pathname === '/app' ? 'Dashboard' : pathname.split('/').filter(Boolean).slice(1).join(' · '))}</h1><p>Operação focada em disparos WhatsApp: conexões isoladas, campanhas, listas, templates, filas, limites, logs e tempo real via SSE.</p></div><div id="app-content" style="margin-top:18px">${content}</div></section></div>`;
  }

  const label = pathname === '/404' ? 'Página não encontrada' : pathname.replace(/^\//, '').replaceAll('/', ' · ').replaceAll('-', ' ');
  return `<section class="hero"><div class="eyebrow">ATTO FLOW</div><h1>${escapeHtml(label)}</h1><p class="lead">Página estruturada com SEO, CTA, conteúdo e links internos para a plataforma enterprise.</p><div class="hero-actions"><a class="btn primary" href="/demo">Agendar demo</a><a class="btn" href="/">Voltar</a></div></section>`;
}

function isKnownPage(pathname) {
  return pages.some((page) => page.path === pathname || matchDynamicPage(page.path, pathname));
}

function matchDynamicPage(pattern, pathname) {
  if (!pattern.includes('[')) return false;
  const regex = new RegExp(`^${pattern.replace(/\/[[][^/]+[]]/g, '/[^/]+')}$`);
  return regex.test(pathname);
}

async function renderPage(html, pathname, ctx = { companyId: app.config.defaultCompanyId, userId: app.config.defaultUserId, role: 'owner' }) {
  const metadata = app.seo.metadata(pathname);
  return html
    .replaceAll('__ATTO_ROUTE__', pathname)
    .replaceAll('__ATTO_TITLE__', metadata.title)
    .replaceAll('__ATTO_DESCRIPTION__', metadata.description)
    .replaceAll('__ATTO_SCHEMA__', JSON.stringify(metadata.schema))
    .replaceAll('__ATTO_CONTENT__', await renderInitialContent(pathname, ctx));
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    logger.error('request failed', { error, path: req.url, correlationId: req.headers['x-correlation-id'] });
    sendJson(res, 500, { ok: false, error: error.message });
  });
});

server.listen(app.config.port, '0.0.0.0', () => {
  logger.info('ATTO FLOW API listening', { port: app.config.port });
});
