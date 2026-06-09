const publicPages = [
  '/', '/precos', '/recursos', '/crm', '/whatsapp', '/automacao', '/ia', '/relatorios', '/integracoes', '/seguranca', '/clientes', '/casos-de-uso', '/imobiliarias', '/vendas', '/atendimento', '/blog', '/blog/[slug]', '/docs', '/docs/api', '/changelog', '/status', '/sobre', '/contato', '/login', '/cadastro', '/demo', '/politica-de-privacidade', '/termos-de-uso', '/cookies', '/lgpd',
];

const internalPages = [
  '/app', '/app/dashboard', '/app/disparos', '/app/disparos/nova', '/app/disparos/alertas', '/app/disparos/operacao', '/app/disparos/[id]', '/app/disparos/[id]/logs', '/app/conexoes', '/app/conexoes/nova', '/app/conexoes/[id]', '/app/listas', '/app/listas/nova', '/app/templates', '/app/inbox', '/app/inbox/[conversationId]', '/app/crm', '/app/crm/leads', '/app/crm/leads/[id]', '/app/crm/pipeline', '/app/crm/contacts', '/app/crm/companies', '/app/crm/tasks', '/app/campaigns', '/app/campaigns/new', '/app/campaigns/[id]', '/app/whatsapp', '/app/whatsapp/connections', '/app/whatsapp/connections/new', '/app/whatsapp/qr', '/app/automations', '/app/automations/new', '/app/automations/[id]', '/app/ai', '/app/ai/playground', '/app/ai/providers', '/app/ai/knowledge-base', '/app/reports', '/app/reports/sales', '/app/reports/campaigns', '/app/reports/team', '/app/reports/whatsapp', '/app/gamification', '/app/ranking', '/app/goals', '/app/team', '/app/team/users', '/app/team/roles', '/app/settings', '/app/settings/company', '/app/settings/users', '/app/settings/billing', '/app/settings/security', '/app/settings/api-keys', '/app/settings/webhooks', '/app/settings/integrations', '/app/admin', '/app/admin/companies', '/app/admin/plans', '/app/admin/audit', '/app/admin/system-health',
];

const systemPages = [
  '/404', '/500', '/manutencao', '/sem-permissao', '/sessao-expirada', '/convite', '/aceitar-convite', '/recuperar-senha', '/redefinir-senha', '/verificar-email', '/onboarding', '/loading', '/empty-state', '/pagamento/erro', '/pagamento/sucesso',
];

function pageTitle(path) {
  if (path === '/') return 'ATTO FLOW | CRM, WhatsApp, automação e IA para vendas';
  const clean = path.replace(/^\//, '').replace(/\[|\]/g, '').replaceAll('/', ' · ').replaceAll('-', ' ');
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)} | ATTO FLOW`;
}

function pageDescription(path) {
  if (path.startsWith('/app/disparos') || path.startsWith('/app/conexoes') || path.startsWith('/app/listas') || path.startsWith('/app/templates')) return 'ATTOZAP Disparos para campanhas WhatsApp, conexões Baileys, listas, templates, filas e logs operacionais.';
  if (path.startsWith('/app')) return 'Área interna ATTO FLOW para CRM, WhatsApp, automações, relatórios, gamificação e gestão enterprise.';
  if (path === '/') return 'Unifique CRM, WhatsApp, campanhas, automação, atendimento omnichannel e IA interna em uma plataforma SaaS enterprise.';
  return 'Conheça a ATTO FLOW: plataforma SaaS enterprise para CRM, WhatsApp, automação, IA, relatórios e produtividade comercial.';
}

function toPage(path, type) {
  return {
    path,
    type,
    title: pageTitle(path),
    description: pageDescription(path),
    h1: path === '/' ? 'Venda, atenda e automatize com ATTO FLOW' : pageTitle(path).replace(' | ATTO FLOW', ''),
  };
}

const pages = [
  ...publicPages.map((path) => toPage(path, 'public')),
  ...internalPages.map((path) => toPage(path, 'internal')),
  ...systemPages.map((path) => toPage(path, 'system')),
];

module.exports = { publicPages, internalPages, systemPages, pages, pageTitle, pageDescription };
