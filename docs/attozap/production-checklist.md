# ATTOZAP DISPAROS — Checklist de Produção

## BullMQ/Redis Production Runtime

O runtime operacional de filas em produção é BullMQ com Redis. A fila em memória existe apenas para `NODE_ENV=test` ou desenvolvimento local explícito com `QUEUE_DRIVER=memory`.

### Variáveis obrigatórias

```env
ATTO_ENV=production
QUEUE_DRIVER=bullmq
REDIS_URL=redis://127.0.0.1:6379
QUEUE_MESSAGE_SEND=attozap.message.send
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3
QUEUE_BACKOFF_MS=5000
```

### Como subir Redis

```bash
redis-server --appendonly yes
```

Em VPS Ubuntu, prefira serviço systemd/Redis gerenciado e proteja o acesso por firewall, senha e rede privada.

### Como rodar worker

```bash
npm run worker
```

Em produção, o worker registra o processador BullMQ da fila `attozap.message.send` e **não usa** `queue.drain()`.

### Como rodar smoke de fila real

```bash
QUEUE_DRIVER=bullmq REDIS_URL=redis://127.0.0.1:6379 npm run smoke:queue
```

O smoke valida conexão Redis, criação com `jobId` fixo, retry/backoff, métricas BullMQ, duplicidade por `jobId` e cancelamento por campanha.

### Como diagnosticar falha de Redis

1. Verifique `GET /api/disparos/health`.
2. Confirme `productionReady=false` e leia `blockers[]`.
3. Teste `redis-cli -u "$REDIS_URL" ping`.
4. Reinicie somente após `PONG` e credenciais corretas.

### Como limpar fila em emergência

Use ferramentas BullMQ/Redis com cuidado. Antes de limpar, cancele campanhas no banco para impedir reenvio no recovery.

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'bull:attozap.message.send*'
```

### Como validar health

`GET /api/disparos/health` deve retornar:

- `queueDriver=bullmq`
- `redisConnected=true`
- `productionReady=true`
- `blockers=[]`
- métricas `waiting`, `delayed`, `active`, `failed`, `completed`, `paused`

## WhatsApp Gateway / Baileys Production

### Variáveis obrigatórias

```env
ATTO_ENV=production
ATTO_BAILEYS_ENABLED=true
ATTO_DRY_RUN=false
WHATSAPP_GATEWAY_URL=http://127.0.0.1:14212
WHATSAPP_SESSION_DIR=/var/lib/atto-flow/whatsapp-sessions
INTERNAL_API_TOKEN=change-me
ATTO_API_BASE_URL=http://127.0.0.1:10000
```

### Como iniciar gateway e API

```bash
npm run api
WHATSAPP_GATEWAY_PORT=14212 npm run gateway
npm run worker
```

### Como conectar sessão e ver QR

1. Crie a conexão pela API `POST /api/disparos/conexoes`.
2. Consulte `GET /sessions/{connectionId}/qr` no gateway.
3. Escaneie o QR pelo WhatsApp.
4. Valide `GET /api/disparos/health` até `gatewayProvider=baileys`, `baileysEnabled=true` e `dryRunAllowed=false` em produção.

### Smoke tests

```bash
ATTO_BAILEYS_ENABLED=true WHATSAPP_GATEWAY_URL=http://127.0.0.1:14212 npm run smoke:gateway
TEST_PHONE=55XXXXXXXXXXX npm run smoke:send
```

### Erros comuns

- `baileysDisabled`: defina `ATTO_BAILEYS_ENABLED=true`.
- `dryRunEnabled`: defina `ATTO_DRY_RUN=false` em produção.
- `gatewayUnreachable`: confirme porta, URL e firewall.
- `sessionDirNotWritable`: ajuste permissão do `WHATSAPP_SESSION_DIR`.
- `baileys_socket_not_ready`: escaneie o QR ou aguarde reconexão.

### Limpeza e recovery

Cada conexão usa sessão isolada em `WHATSAPP_SESSION_DIR/{companyId}/{connectionId}`. Para resetar uma conexão, desconecte a sessão, pare o gateway, remova apenas a pasta do `connectionId` afetado e suba o gateway novamente. No restart, o gateway recria sockets a partir das pastas existentes e sincroniza status/QR/heartbeat pela API interna protegida por `INTERNAL_API_TOKEN`.

## Operational Delivery Safety

### Status de entrega e ACK/read receipts
- O gateway Baileys escuta `messages.update` e `message-receipt.update` e envia ACKs para `POST /api/internal/whatsapp/messages/ack` com `providerMessageId`, `providerChatId`, `ackStatus`, `deliveredAt` e `readAt` quando disponíveis.
- A API mapeia ACKs para `sent`, `delivered` e `read`, atualizando `MessageJob`, `CampaignContact`, `MessageLog` e publicando eventos SSE para o painel.
- Jobs `sent` com `providerMessageId` não devem ser reenviados; se ainda não tiverem ACK, entram em reconciliação como `pendingAcks`.

### Respostas recebidas
- O gateway captura `messages.upsert` de entrada e chama `POST /api/internal/whatsapp/messages/inbound`.
- A API normaliza o telefone brasileiro, procura o contato da campanha e marca `CampaignContact.status=replied` com `repliedAt`.
- Se não houver campanha correspondente, o inbound é mantido como log operacional para futura caixa de entrada/conversa.

### Classificação de erros e retry inteligente
- Erros são classificados em `TEMPORARY`, `PERMANENT` e `CONNECTION_RISK` por `modules/attozap/errors/error-classifier.js`.
- `TEMPORARY`: marca job como `retrying`, registra `message.retrying` e deixa o worker/BullMQ tentar novamente conforme `QUEUE_MAX_ATTEMPTS` e backoff.
- `PERMANENT`: marca job/contato como `failed` sem novo retry.
- `CONNECTION_RISK`: degrada ou bloqueia a conexão, pausa campanhas da conexão e registra `connection.degraded` ou `connection.blocked`.

### Health score, rate limit adaptativo e pausa automática
- Cada conexão inicia com `healthScore=100` e `healthState=healthy`.
- Sucessos, delivered, read e replies aumentam o score; falhas temporárias, permanentes e riscos de conexão reduzem o score.
- O rate limit adaptativo reduz `hourlyLimit` e aumenta delays em estados `watch`, `degraded` e `critical`; estado `blocked` impede envio.
- Campanhas podem ser pausadas automaticamente com `pauseReason` como `connection_blocked` ou `connection_degraded`.

### Reconciliação operacional
- Execute `npm run reconcile:disparos` para corrigir inconsistências entre `MessageJob`, `CampaignContact` e contadores de campanha.
- A reconciliação identifica ACKs pendentes, corrige contatos que já possuem job `sent` com `providerMessageId` e recalcula `totalSent`, `totalDelivered`, `totalFailures` e `totalPending`.

### Investigação de conexão degradada/bloqueada
1. Verifique `GET /api/disparos/health` para `connectionsDegraded`, `connectionsCritical`, `connectionsBlocked`, `pendingAcks`, `stuckJobs` e `recentConnectionRisks`.
2. Consulte logs por campanha/conexão e filtre por `connection.degraded`, `connection.blocked`, `message.retrying`, `message.failed` e `rate_limit.adapted`.
3. Se a conexão estiver `blocked`, valide a sessão no gateway, limpe sessão apenas se necessário e retome a campanha manualmente somente após QR/conexão saudável.

## Observability & Operations

### Endpoints operacionais
- `GET /metrics`: exporta métricas Prometheus-ready com contadores de campanhas, mensagens, fila, conexões, gateway, Redis, banco e worker.
- `GET /api/disparos/health`: mantém visão de saúde operacional do módulo com fila, gateway, conexões, ACKs pendentes e riscos recentes.
- `GET /api/disparos/readiness`: retorna `ready`, blockers, warnings e dependências obrigatórias para produção.
- `GET /api/disparos/ops-dashboard`: consolida saúde geral, blockers, campanhas, conexões, fila, gateway, Redis, DB, alertas, logs críticos e recomendações.
- `GET /api/disparos/alerts`: lista alertas operacionais abertos/resolvidos.
- `POST /api/disparos/alerts/:id/resolve`: resolve alerta e registra auditoria.

### Logs, correlation id e auditoria
- Logs críticos devem sair em JSON com `timestamp`, `service`, `environment`, `correlationId`, `companyId`, `campaignId`, `connectionId`, `jobId`, `eventType` e erro estruturado.
- Toda request recebe `x-correlation-id`; quando ausente, a API gera um UUID e propaga para SSE, logs, MessageLog metadata, jobs e chamadas ao Gateway.
- Ações manuais como iniciar, pausar, retomar, cancelar campanha e resolver alerta gravam `AuditLog` com `correlationId`, IP e user agent quando disponíveis.

### Alertas e runbooks
- Alertas internos cobrem `connection.blocked`, `connection.critical`, `gateway.down`, `redis.down`, `queue.failed_spike`, `campaign.stuck`, `ack.pending_spike` e riscos de recovery/sessão.
- Runbooks ficam em `docs/attozap/runbooks/` e devem ser usados antes de qualquer ação manual sensível em produção.

### E2E real opcional
- `npm run e2e:disparos` executa fluxo real somente quando `DATABASE_URL`, `REDIS_URL`, `WHATSAPP_GATEWAY_URL`, `TEST_PHONE` e `ATTO_BAILEYS_ENABLED=true` existirem.
- Se as variáveis reais faltarem, o script pula com mensagem clara e não quebra `npm test`.
