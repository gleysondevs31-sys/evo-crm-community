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
