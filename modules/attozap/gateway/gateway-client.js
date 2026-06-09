class GatewayClient {
  constructor(config = {}) {
    this.baseUrl = (config.whatsappGatewayUrl || '').replace(/\/$/, '');
    this.token = config.internalApiToken || '';
    this.timeoutMs = config.gatewayTimeoutMs || 10000;
    this.production = config.attoEnv === 'production';
  }

  async request(path, options = {}) {
    if (!this.baseUrl) throw new Error('WHATSAPP_GATEWAY_URL não configurado.');
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...(options.correlationId ? { 'x-correlation-id': options.correlationId } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Gateway HTTP ${response.status}`);
    if (this.production && payload.dryRun) throw new Error('Gateway retornou dryRun em production.');
    if (this.production && payload.provider && payload.provider !== 'baileys') throw new Error(`Provider inválido em production: ${payload.provider}`);
    return payload;
  }

  health() { return this.request('/healthz'); }
  createSession(input) { return this.request('/sessions', { method: 'POST', body: input, correlationId: input.correlationId }); }
  getSession(connectionId) { return this.request(`/sessions/${connectionId}`); }
  disconnectSession({ connectionId }) { return this.request(`/sessions/${connectionId}/disconnect`, { method: 'POST', body: {} }); }
  sendMessage(input) {
    return this.request(`/sessions/${input.connectionId}/send`, { method: 'POST', body: input, correlationId: input.correlationId });
  }
}

function createGatewayClient(config) { return new GatewayClient(config); }
module.exports = { GatewayClient, createGatewayClient };
