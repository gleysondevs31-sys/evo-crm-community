# ATTOZAP DISPAROS

Módulo focado exclusivamente em disparos WhatsApp operáveis em produção.

## Escopo consolidado agora

- Conexões WhatsApp multiempresa com status, QR Code, heartbeat, limites diário/hora e delays por conexão.
- Listas de contatos com normalização de telefones brasileiros, validação de DDD e deduplicação.
- Templates e preview com variáveis (`{{nome}}`, `{{telefone}}`, `{{empresa}}` e campos customizados) e spintax simples.
- Campanhas com ciclo `draft -> running -> paused/resumed -> completed/canceled/failed`.
- Jobs de mensagem idempotentes por campanha/contato, prontos para BullMQ/Redis.
- Logs operacionais para campanha, conexão, fila e envio.
- SSE de snapshot e eventos em tempo real para QR, conexão, campanha, job e recovery.

## Produção real

- `QUEUE_DRIVER=bullmq` ativa o adaptador BullMQ/Redis mantendo a mesma API interna de filas.
- `QUEUE_MESSAGE_SEND=attozap.message.send` define a fila de envio de mensagens.
- O `jobId` idempotente segue `send:{companyId}:{campaignId}:{contactId}` para evitar duplicidade.
- `ATTO_BAILEYS_ENABLED=true` ativa o gateway Baileys real com `useMultiFileAuthState` e sessões isoladas.
- Sessões ficam em `WHATSAPP_SESSIONS_DIR/{companyId}/{connectionId}`.
- `recoverAttozapDisparos()` roda no bootstrap para reconectar estados e reenfileirar pendências sem reenviar jobs já enviados.
- `GET /api/disparos/health` expõe Redis/fila/workers/conexões/campanhas/jobs.

## Fora do foco imediato

CRM avançado, billing, gamificação, IA avançada e automações visuais permanecem fora deste ciclo para manter foco absoluto nos disparos.
