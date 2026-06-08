const http = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');
const { createAttoFlowApp } = require('./composition');
const { getRequestContext, filterLeadsForContext } = require('../../packages/auth');
const { logger } = require('../../packages/logger');
const { pages } = require('../../packages/config/routes');
const { schema, sensitiveTables } = require('../../packages/database/schema');

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

  if (url.pathname === '/sitemap.xml') {
    return sendText(res, 200, app.seo.sitemap(), 'application/xml');
  }

  if (url.pathname === '/robots.txt') {
    return sendText(res, 200, app.seo.robots());
  }

  if (isKnownPage(url.pathname)) {
    const indexPath = join(process.cwd(), 'apps/web/index.html');
    return sendHtml(res, renderPage(readFileSync(indexPath, 'utf8'), url.pathname, ctx));
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

  if (url.pathname === '/api/admin/companies') {
    return sendJson(res, 200, { companies: app.admin.companies() });
  }

  if (url.pathname === '/api/admin/system-health') {
    return sendJson(res, 200, app.admin.systemHealth());
  }

  if (url.pathname === '/api/billing/plans') {
    return sendJson(res, 200, { plans: app.billing.plans() });
  }

  if (url.pathname === '/api/billing/subscription') {
    return sendJson(res, 200, app.billing.currentSubscription(app.database.getCompany(ctx.companyId)));
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
    return sendJson(res, 200, { jobs: app.queue.list() });
  }

  if (url.pathname.startsWith('/api/')) {
    return sendJson(res, 404, { ok: false, error: 'not_found' });
  }

  const indexPath = join(process.cwd(), 'apps/web/index.html');
  return sendHtml(res, renderPage(readFileSync(indexPath, 'utf8'), '/404', ctx), 404);
}


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInitialContent(pathname, ctx) {
  if (pathname === '/') {
    const dashboard = app.reports.dashboard(ctx);
    const inbox = app.attozap.inbox(ctx);
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
    const dashboard = app.reports.dashboard(ctx);
    const stages = app.crm.stages;
    const leads = filterLeadsForContext(app.crm.listLeads(ctx), ctx);
    const inbox = app.attozap.inbox(ctx);
    const health = app.admin.systemHealth();
    const menu = ['/app/dashboard','/app/inbox','/app/crm/pipeline','/app/campaigns','/app/whatsapp/connections','/app/automations','/app/ai/playground','/app/reports','/app/gamification','/app/team/users','/app/settings/company','/app/admin/system-health']
      .map((href) => `<a href="${href}">${escapeHtml(href.replace('/app/','').replaceAll('/',' · '))}</a>`)
      .join('');
    let content = `<div class="metric-grid">${[['Leads',dashboard.totalLeads],['Conversas',dashboard.activeConversations],['Conversão',`${dashboard.conversionRate}%`],['Saúde',health.status]].map(([k,v]) => `<div class="card"><div class="eyebrow">${escapeHtml(k)}</div><h2>${escapeHtml(v)}</h2></div>`).join('')}</div><div class="card"><h3>Insight</h3><p>${escapeHtml(dashboard.aiInsight)}</p></div>`;

    if (pathname.includes('pipeline') || pathname.includes('crm')) {
      content = `<div class="kanban">${stages.slice(0, 8).map((stage) => `<div class="card"><h3>${escapeHtml(stage)}</h3>${leads.filter((lead) => lead.stage === stage).map((lead) => `<div class="lead-card"><strong>${escapeHtml(lead.name)}</strong><p>${escapeHtml(lead.origin)} · score ${escapeHtml(lead.score)}</p><button onclick="suggest('${lead.id}')">ATTO AI</button></div>`).join('') || '<p>Sem leads</p>'}</div>`).join('')}</div>`;
    } else if (pathname.includes('inbox') || pathname.includes('whatsapp')) {
      content = `<div class="feature-grid">${inbox.map((conversation) => `<div class="card"><h3>${escapeHtml(conversation.leadName)}</h3><p>${escapeHtml(conversation.phone)}</p><p>${escapeHtml(conversation.preview)}</p></div>`).join('')}</div>`;
    } else if (pathname.includes('ai')) {
      content = `<pre>${escapeHtml(JSON.stringify(app.attoAi.usageLogs(ctx.companyId), null, 2))}</pre>`;
    }

    return `<div class="app-layout"><aside class="panel app-menu"><strong>ATTO FLOW</strong>${menu}</aside><section><div class="card"><div class="eyebrow">${escapeHtml(pathname)}</div><h1 style="font-size:54px">${escapeHtml(pathname === '/app' ? 'Dashboard' : pathname.split('/').filter(Boolean).slice(1).join(' · '))}</h1><p>Área operacional enterprise com RBAC, multiempresa, dados reais do MVP e integração ATTO AI.</p></div><div id="app-content" style="margin-top:18px">${content}</div></section></div>`;
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

function renderPage(html, pathname, ctx = { companyId: app.config.defaultCompanyId, userId: app.config.defaultUserId, role: 'owner' }) {
  const metadata = app.seo.metadata(pathname);
  return html
    .replaceAll('__ATTO_ROUTE__', pathname)
    .replaceAll('__ATTO_TITLE__', metadata.title)
    .replaceAll('__ATTO_DESCRIPTION__', metadata.description)
    .replaceAll('__ATTO_SCHEMA__', JSON.stringify(metadata.schema))
    .replaceAll('__ATTO_CONTENT__', renderInitialContent(pathname, ctx));
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
