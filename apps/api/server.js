const http = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');
const { createAttoFlowApp } = require('./composition');
const { getRequestContext, filterLeadsForContext } = require('../../packages/auth');
const { logger } = require('../../packages/logger');

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

function sendHtml(res, content) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(content);
}

function sendStatic(res, filePath) {
  const types = { '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.html': 'text/html' };
  res.writeHead(200, { 'content-type': `${types[extname(filePath)] || 'text/plain'}; charset=utf-8` });
  res.end(readFileSync(filePath));
}

function context(req) {
  return getRequestContext(req, app.database);
}

async function route(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const ctx = context(req);

  if (url.pathname === '/' || url.pathname === '/app') {
    const indexPath = join(process.cwd(), 'apps/web/index.html');
    return sendHtml(res, readFileSync(indexPath, 'utf8'));
  }

  if (url.pathname.startsWith('/assets/')) {
    const filePath = join(process.cwd(), 'apps/web', url.pathname);
    if (existsSync(filePath)) return sendStatic(res, filePath);
  }

  if (url.pathname === '/healthz' || url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'atto-flow-api',
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    });
  }

  if (url.pathname === '/api/status') {
    return sendJson(res, 200, {
      name: app.config.appName,
      mode: 'modular-mvp',
      company: app.database.getCompany(ctx.companyId),
      modules: ['attozap', 'atto-ai', 'crm', 'automation', 'reports', 'gamification'],
    });
  }

  if (url.pathname === '/api/dashboard') {
    return sendJson(res, 200, app.reports.dashboard(ctx));
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
      return sendJson(res, 201, { connection: app.attozap.createConnection(ctx, body) });
    }
    return sendJson(res, 200, { connections: app.attozap.listConnections(ctx) });
  }

  if (url.pathname === '/api/attozap/inbox') {
    return sendJson(res, 200, { conversations: app.attozap.inbox(ctx) });
  }

  const suggestReplyMatch = url.pathname.match(/^\/api\/attozap\/leads\/([^/]+)\/suggest-reply$/);
  if (suggestReplyMatch) {
    return sendJson(res, 200, { suggestion: app.attozap.suggestReply(ctx, suggestReplyMatch[1]) });
  }

  if (url.pathname === '/api/attozap/campaigns') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 201, { campaign: app.attozap.createCampaign(ctx, body) });
    }
    return sendJson(res, 200, { campaigns: app.database.listCampaigns(ctx.companyId) });
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

  if (url.pathname === '/api/atto-ai/logs') {
    return sendJson(res, 200, { logs: app.attoAi.usageLogs(ctx.companyId) });
  }

  if (url.pathname === '/api/queue') {
    if (req.method === 'POST') {
      const drained = await app.queue.drain();
      return sendJson(res, 200, { jobs: drained });
    }
    return sendJson(res, 200, { jobs: app.queue.list() });
  }

  return sendJson(res, 404, { ok: false, error: 'not_found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    logger.error('request failed', { error: error.message, path: req.url });
    sendJson(res, 500, { ok: false, error: error.message });
  });
});

server.listen(app.config.port, '0.0.0.0', () => {
  logger.info('ATTO FLOW API listening', { port: app.config.port });
});
