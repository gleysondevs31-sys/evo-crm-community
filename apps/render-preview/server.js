const http = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const port = Number(process.env.PORT || 10000);
const startedAt = new Date();

function safeRead(path, fallback) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return fallback;
  }
}

const attoFlowReadme = safeRead(
  join(process.cwd(), 'docs/atto-flow/README.md'),
  '# ATTO FLOW\n\nDocumentation not bundled.',
);
const attoAiReadme = safeRead(
  join(process.cwd(), 'docs/atto-flow/atto-ai.md'),
  '# ATTO AI\n\nDocumentation not bundled.',
);
const attoZapReadme = safeRead(
  join(process.cwd(), 'docs/attozap/README.md'),
  '# ATTOZAP\n\nDocumentation not bundled.',
);

const modules = [
  {
    name: 'ATTOZAP',
    slug: 'attozap',
    description: 'WhatsApp, CRM conversacional, campanhas, conexões e atendimento comercial.',
  },
  {
    name: 'ATTO AI',
    slug: 'atto-ai',
    description: 'Camada interna de IA, roteador de modelos, LLaMA local, RAG, memória e providers externos.',
  },
  {
    name: 'CRM',
    slug: 'crm',
    description: 'Leads, pipelines, histórico, tarefas, notas, tags e próximas ações.',
  },
  {
    name: 'Automation',
    slug: 'automation',
    description: 'Fluxos visuais, gatilhos, condições, ações, filas e decisões inteligentes.',
  },
  {
    name: 'Reports',
    slug: 'reports',
    description: 'Métricas, dashboards, exportações, explicações executivas e insights.',
  },
  {
    name: 'Gamification',
    slug: 'gamification',
    description: 'Metas, pontuação, rankings, recompensas e desafios comerciais.',
  },
];

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function html(res, body) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function markdownExcerpt(markdown, maxLines = 18) {
  return markdown
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, maxLines)
    .join('\n');
}

function landingPage() {
  const moduleCards = modules
    .map(
      (module) => `
        <article class="card">
          <div class="badge">${escapeHtml(module.slug)}</div>
          <h3>${escapeHtml(module.name)}</h3>
          <p>${escapeHtml(module.description)}</p>
        </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ATTO FLOW Preview</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #05050a;
      --panel: rgba(18, 18, 30, 0.82);
      --panel-border: rgba(132, 92, 255, 0.28);
      --text: #f7f7ff;
      --muted: #a8a8c7;
      --purple: #8b5cf6;
      --blue: #22d3ee;
      --green: #34d399;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 20% 20%, rgba(139, 92, 246, 0.32), transparent 34rem),
        radial-gradient(circle at 80% 10%, rgba(34, 211, 238, 0.20), transparent 28rem),
        linear-gradient(135deg, #030307 0%, var(--bg) 52%, #080814 100%);
      color: var(--text);
    }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0; }
    .hero {
      border: 1px solid var(--panel-border);
      border-radius: 32px;
      padding: clamp(28px, 5vw, 64px);
      background: linear-gradient(135deg, rgba(18, 18, 30, 0.92), rgba(8, 8, 18, 0.78));
      box-shadow: 0 24px 90px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
    .eyebrow { color: var(--green); font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    h1 { font-size: clamp(42px, 9vw, 92px); line-height: 0.92; margin: 18px 0; max-width: 900px; }
    .gradient { background: linear-gradient(90deg, var(--purple), var(--blue)); -webkit-background-clip: text; color: transparent; }
    .lead { color: var(--muted); font-size: clamp(18px, 2.5vw, 24px); line-height: 1.6; max-width: 900px; }
    .actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 28px; }
    .button {
      color: var(--text);
      text-decoration: none;
      border: 1px solid var(--panel-border);
      border-radius: 999px;
      padding: 12px 18px;
      background: rgba(255, 255, 255, 0.06);
    }
    .button.primary { background: linear-gradient(90deg, var(--purple), var(--blue)); border: 0; font-weight: 800; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; margin-top: 26px; }
    .card {
      border: 1px solid var(--panel-border);
      border-radius: 24px;
      padding: 22px;
      background: var(--panel);
      min-height: 180px;
    }
    .badge { color: var(--blue); font-size: 12px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
    h2 { margin-top: 46px; font-size: 32px; }
    h3 { margin: 12px 0; font-size: 22px; }
    p { color: var(--muted); line-height: 1.55; }
    pre {
      overflow: auto;
      border: 1px solid var(--panel-border);
      border-radius: 20px;
      padding: 22px;
      background: rgba(0, 0, 0, 0.35);
      color: #d9d7ff;
    }
    footer { color: var(--muted); margin-top: 40px; text-align: center; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Render preview ativo</div>
      <h1>ATTO FLOW <span class="gradient">Community</span></h1>
      <p class="lead">
        Plataforma SaaS modular para CRM, WhatsApp, automação, campanhas, gestão comercial e ATTO AI como cérebro interno.
        Este container existe para testar a base na Render sem depender dos submodules ou Dockerfiles dos serviços Evo.
      </p>
      <div class="actions">
        <a class="button primary" href="/healthz">Health check</a>
        <a class="button" href="/api/status">API status</a>
        <a class="button" href="/api/modules">Módulos</a>
        <a class="button" href="/docs/atto-ai">ATTO AI docs</a>
      </div>
    </section>

    <h2>Módulos internos</h2>
    <section class="grid">${moduleCards}</section>

    <h2>Resumo ATTO FLOW</h2>
    <pre>${escapeHtml(markdownExcerpt(attoFlowReadme))}</pre>

    <footer>ATTO FLOW preview • uptime ${Math.round((Date.now() - startedAt.getTime()) / 1000)}s</footer>
  </main>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    html(res, landingPage());
    return;
  }

  if (url.pathname === '/healthz' || url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      service: 'atto-flow-render-preview',
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    });
    return;
  }

  if (url.pathname === '/api/status') {
    json(res, 200, {
      name: 'ATTO FLOW Community',
      mode: 'render-preview',
      attoAi: 'internal-module',
      attoZap: 'commercial-module',
      modules: modules.map((module) => module.slug),
      render: {
        port,
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    });
    return;
  }

  if (url.pathname === '/api/modules') {
    json(res, 200, { modules });
    return;
  }

  if (url.pathname === '/docs/atto-flow') {
    json(res, 200, { title: 'ATTO FLOW', markdown: attoFlowReadme });
    return;
  }

  if (url.pathname === '/docs/atto-ai') {
    json(res, 200, { title: 'ATTO AI', markdown: attoAiReadme });
    return;
  }

  if (url.pathname === '/docs/attozap') {
    json(res, 200, { title: 'ATTOZAP', markdown: attoZapReadme });
    return;
  }

  json(res, 404, { ok: false, error: 'not_found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`ATTO FLOW Render preview listening on port ${port}`);
});
