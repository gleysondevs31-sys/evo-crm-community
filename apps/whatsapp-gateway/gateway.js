const http = require('node:http');
const port = Number(process.env.WHATSAPP_GATEWAY_PORT || process.env.PORT || 8081);

const sessions = new Map();

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/healthz') return json(res, 200, { ok: true, service: 'atto-whatsapp-gateway', sessions: sessions.size });
  if (url.pathname === '/sessions' && req.method === 'GET') return json(res, 200, { sessions: [...sessions.values()] });
  if (url.pathname === '/sessions' && req.method === 'POST') {
    const id = `session_${sessions.size + 1}`;
    const session = { id, status: 'qr_required', qrCode: `atto-demo-qr-${id}`, createdAt: new Date().toISOString() };
    sessions.set(id, session);
    return json(res, 201, { session });
  }
  return json(res, 404, { ok: false, error: 'not_found' });
}).listen(port, '0.0.0.0', () => console.log(`ATTO WhatsApp Gateway listening on ${port}`));
