const http = require('node:http');
const { join } = require('node:path');
const { mkdirSync } = require('node:fs');
const { config } = require('../../packages/config');
const { createBaileysSession } = require('../../modules/attozap/gateway/baileys-adapter');

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

function sessionPath(companyId, connectionId) {
  return join(config.whatsappSessionsDir, companyId, connectionId);
}

async function createSession(input = {}) {
  const companyId = input.companyId || config.defaultCompanyId;
  const connectionId = input.connectionId || `connection_${sessions.size + 1}`;
  const id = input.id || connectionId;
  const path = sessionPath(companyId, connectionId);
  mkdirSync(path, { recursive: true });
  const session = {
    id,
    companyId,
    connectionId,
    name: input.name || `Conexão ${sessions.size + 1}`,
    status: 'qr_required',
    provider: config.baileysEnabled ? 'baileys' : 'baileys-disabled-local-qr',
    processMode: 'isolated-session',
    qrCode: `attozap-qr-${id}-${Date.now()}`,
    sessionPath: path,
    reconnectAttempts: 0,
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  sessions.set(id, session);

  if (config.baileysEnabled) {
    createBaileysSession({ companyId, connectionId }, {
      onConnectionUpdate(update) {
        session.lastHeartbeatAt = new Date().toISOString();
        if (update.qr) {
          session.qrCode = update.qr;
          session.status = 'qr_required';
        }
        if (update.connection === 'open') session.status = 'connected';
        if (update.connection === 'close') {
          session.reconnectAttempts += 1;
          session.status = session.reconnectAttempts > config.gatewayReconnectAttempts ? 'disconnected' : 'reconnecting';
        }
        session.lastConnectionUpdate = update;
      },
      onMessagesUpsert(event) {
        session.lastMessageAt = new Date().toISOString();
        session.lastMessageEvent = { type: event.type, count: event.messages?.length || 0 };
      },
    }, { sessionsDir: config.whatsappSessionsDir }).then(({ socket }) => {
      session.socket = socket;
      session.socketReady = Boolean(socket);
    });
  }

  return session;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz') return json(res, 200, { ok: true, service: 'atto-whatsapp-gateway', provider: config.baileysEnabled ? 'baileys' : 'stub-compatible', sessions: sessions.size, sessionsDir: config.whatsappSessionsDir });
    if (url.pathname === '/sessions' && req.method === 'GET') return json(res, 200, { sessions: [...sessions.values()].map(({ socket, ...session }) => session) });
    if (url.pathname === '/sessions' && req.method === 'POST') return json(res, 201, { session: await createSession(await readBody(req)) });


    const sendMatch = url.pathname.match(/^\/sessions\/([^/]+)\/send$/);
    if (sendMatch && req.method === 'POST') {
      const session = sessions.get(sendMatch[1]);
      if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
      const body = await readBody(req);
      const jid = String(body.phone || '').replace(/\D/g, '') + '@s.whatsapp.net';
      if (!session.socket || !config.baileysEnabled) {
        return json(res, 202, { ok: true, provider: session.provider, messageId: `stub:${session.id}:${Date.now()}`, jid, dryRun: true });
      }
      const result = await session.socket.sendMessage(jid, body.mediaUrl ? { image: { url: body.mediaUrl }, caption: body.message } : { text: body.message });
      return json(res, 200, { ok: true, provider: 'baileys', messageId: result?.key?.id, jid });
    }

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
