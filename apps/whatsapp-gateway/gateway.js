const http = require('node:http');
const port = Number(process.env.WHATSAPP_GATEWAY_PORT || process.env.PORT || 8081);

const sessions = new Map();

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

function createSession(input = {}) {
  const id = input.id || `session_${sessions.size + 1}`;
  const session = {
    id,
    companyId: input.companyId || 'company_atto_demo',
    connectionId: input.connectionId || id,
    name: input.name || `Conexão ${sessions.size + 1}`,
    status: 'qr_required',
    provider: 'baileys-adapter-ready',
    processMode: 'isolated-session',
    qrCode: `attozap-qr-${id}-${Date.now()}`,
    sessionPath: `sessions/${input.companyId || 'company_atto_demo'}/${id}`,
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  sessions.set(id, session);
  return session;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz') return json(res, 200, { ok: true, service: 'atto-whatsapp-gateway', provider: 'baileys-adapter-ready', sessions: sessions.size });
    if (url.pathname === '/sessions' && req.method === 'GET') return json(res, 200, { sessions: [...sessions.values()] });
    if (url.pathname === '/sessions' && req.method === 'POST') return json(res, 201, { session: createSession(await readBody(req)) });

    const heartbeatMatch = url.pathname.match(/^\/sessions\/([^/]+)\/heartbeat$/);
    if (heartbeatMatch && req.method === 'POST') {
      const session = sessions.get(heartbeatMatch[1]);
      if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
      session.lastHeartbeatAt = new Date().toISOString();
      session.status = 'connected';
      return json(res, 200, { session });
    }

    const statusMatch = url.pathname.match(/^\/sessions\/([^/]+)\/status$/);
    if (statusMatch && req.method === 'POST') {
      const session = sessions.get(statusMatch[1]);
      if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
      const body = await readBody(req);
      session.status = body.status || session.status;
      session.lastHeartbeatAt = new Date().toISOString();
      return json(res, 200, { session });
    }

    return json(res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}).listen(port, '0.0.0.0', () => console.log(`ATTO WhatsApp Gateway listening on ${port}`));
