const http = require('node:http');
const { join } = require('node:path');
const { mkdirSync, readdirSync, statSync, accessSync, constants } = require('node:fs');
const { config } = require('../../packages/config');
const { createBaileysSession } = require('../../modules/attozap/gateway/baileys-adapter');

const port = Number(process.env.WHATSAPP_GATEWAY_PORT || process.env.PORT || 8081);
const sessions = new Map();
const production = config.attoEnv === 'production';

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload, null, 2));
}

function publicSession(session) {
  const { socket, ...safe } = session;
  return { ok: true, sessionId: safe.id, dryRun: !config.baileysEnabled, ...safe };
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

async function notifyApi(connectionId, kind, body) {
  if (!config.apiBaseUrl || !config.internalApiToken) return;
  await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}/api/internal/whatsapp/connections/${connectionId}/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.internalApiToken}` },
    body: JSON.stringify(body),
  }).catch(() => {});
}

async function attachBaileys(session) {
  if (!config.baileysEnabled) return session;
  const { socket, sessionPath: path } = await createBaileysSession({ companyId: session.companyId, connectionId: session.connectionId }, {
    async onConnectionUpdate(update) {
      session.updatedAt = new Date().toISOString();
      session.lastHeartbeatAt = session.updatedAt;
      if (update.qr) {
        session.qrCode = update.qr;
        session.status = 'qr_required';
        await notifyApi(session.connectionId, 'qr', { companyId: session.companyId, qrCode: update.qr, provider: session.provider, sessionPath: session.sessionPath });
      }
      if (update.connection === 'open') {
        session.status = 'connected';
        session.qrCode = null;
      }
      if (update.connection === 'close') {
        session.reconnectAttempts += 1;
        session.status = session.reconnectAttempts > config.gatewayReconnectAttempts ? 'disconnected' : 'reconnecting';
      }
      await notifyApi(session.connectionId, 'status', { companyId: session.companyId, status: session.status, provider: session.provider, sessionPath: session.sessionPath });
      session.lastConnectionUpdate = update;
    },
    onMessagesUpsert(event) {
      session.lastMessageAt = new Date().toISOString();
      session.lastMessageEvent = { type: event.type, count: event.messages?.length || 0 };
    },
  }, { sessionsDir: config.whatsappSessionsDir });
  session.socket = socket;
  session.socketReady = Boolean(socket);
  session.sessionPath = path;
  session.provider = 'baileys';
  return session;
}

async function createSession(input = {}) {
  const companyId = input.companyId || config.defaultCompanyId;
  const connectionId = input.connectionId || input.id || `connection_${sessions.size + 1}`;
  const existing = sessions.get(connectionId);
  if (existing) return publicSession(existing);
  const path = sessionPath(companyId, connectionId);
  mkdirSync(path, { recursive: true });
  accessSync(path, constants.W_OK);
  const session = {
    id: connectionId,
    companyId,
    connectionId,
    name: input.name || `Conexão ${sessions.size + 1}`,
    status: config.baileysEnabled ? 'pending' : 'qr_required',
    provider: config.baileysEnabled ? 'baileys' : 'baileys-disabled-local-qr',
    qrCode: config.baileysEnabled ? null : `attozap-qr-${connectionId}-${Date.now()}`,
    sessionPath: path,
    reconnectAttempts: 0,
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sessions.set(connectionId, session);
  await attachBaileys(session).catch(async (error) => {
    session.status = 'error';
    session.error = error.message;
    await notifyApi(connectionId, 'log', { companyId, type: 'gateway.session_error', status: 'error', error: error.message });
    if (production) throw error;
  });
  await notifyApi(connectionId, 'status', { companyId, status: session.status, provider: session.provider, sessionPath: session.sessionPath, qrCode: session.qrCode });
  return publicSession(session);
}

async function bootstrapSessions() {
  mkdirSync(config.whatsappSessionsDir, { recursive: true });
  for (const companyId of readdirSync(config.whatsappSessionsDir)) {
    const companyPath = join(config.whatsappSessionsDir, companyId);
    if (!statSync(companyPath).isDirectory()) continue;
    for (const connectionId of readdirSync(companyPath)) {
      const path = join(companyPath, connectionId);
      if (statSync(path).isDirectory()) await createSession({ companyId, connectionId, id: connectionId, name: connectionId }).catch(() => {});
    }
  }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const connectedSessions = [...sessions.values()].filter((session) => session.status === 'connected').length;
    const qrRequiredSessions = [...sessions.values()].filter((session) => session.status === 'qr_required').length;
    if (url.pathname === '/healthz') return json(res, 200, { ok: true, service: 'atto-whatsapp-gateway', provider: config.baileysEnabled ? 'baileys' : 'baileys-disabled-local-qr', dryRun: !config.baileysEnabled, baileysEnabled: config.baileysEnabled, sessions: sessions.size, connectedSessions, qrRequiredSessions, sessionsDir: config.whatsappSessionsDir });
    if (url.pathname === '/sessions' && req.method === 'GET') return json(res, 200, { ok: true, sessions: [...sessions.values()].map(publicSession) });
    if (url.pathname === '/sessions' && req.method === 'POST') return json(res, 201, { session: await createSession(await readBody(req)) });

    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && req.method === 'GET') {
      const session = sessions.get(sessionMatch[1]);
      if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
      return json(res, 200, publicSession(session));
    }

    const qrMatch = url.pathname.match(/^\/sessions\/([^/]+)\/qr$/);
    if (qrMatch && req.method === 'GET') {
      const session = sessions.get(qrMatch[1]);
      if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
      return json(res, 200, { ...publicSession(session), qrCode: session.qrCode });
    }

    const sendMatch = url.pathname.match(/^\/sessions\/([^/]+)\/send$/);
    if (sendMatch && req.method === 'POST') {
      const session = sessions.get(sendMatch[1]);
      if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
      const body = await readBody(req);
      const jid = String(body.phone || '').replace(/\D/g, '') + '@s.whatsapp.net';
      if (!session.socket || !config.baileysEnabled) {
        if (production || config.dryRun === false) return json(res, 409, { ok: false, provider: session.provider, dryRun: false, error: 'baileys_socket_not_ready' });
        return json(res, 202, { ok: true, provider: session.provider, messageId: `stub:${session.id}:${Date.now()}`, jid, dryRun: true });
      }
      const result = await session.socket.sendMessage(jid, body.mediaUrl ? { image: { url: body.mediaUrl }, caption: body.message } : { text: body.message });
      const messageId = result?.key?.id;
      if (!messageId) return json(res, 502, { ok: false, provider: 'baileys', dryRun: false, error: 'missing_provider_message_id' });
      return json(res, 200, { ok: true, provider: 'baileys', dryRun: false, messageId, jid });
    }

    const disconnectMatch = url.pathname.match(/^\/sessions\/([^/]+)\/disconnect$/);
    if (disconnectMatch && req.method === 'POST') {
      const session = sessions.get(disconnectMatch[1]);
      if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
      await session.socket?.logout?.().catch(() => {});
      session.status = 'disconnected';
      session.updatedAt = new Date().toISOString();
      await notifyApi(session.connectionId, 'status', { companyId: session.companyId, status: session.status, provider: session.provider, sessionPath: session.sessionPath });
      return json(res, 200, publicSession(session));
    }

    return json(res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}).listen(port, '0.0.0.0', () => {
  bootstrapSessions().catch(() => {});
  console.log(`ATTO WhatsApp Gateway listening on ${port}`);
});
