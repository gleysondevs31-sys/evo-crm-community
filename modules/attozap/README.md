# ATTOZAP DISPAROS

Módulo focado exclusivamente em disparos WhatsApp operáveis em produção.

## Escopo consolidado agora

- Conexões WhatsApp multiempresa com status, QR Code, heartbeat, limites diário/hora e delays por conexão.
- Listas de contatos com normalização de telefones brasileiros, validação de DDD e deduplicação.
- Templates e preview com variáveis (`{{nome}}`, `{{telefone}}`, `{{empresa}}` e campos customizados) e spintax simples.
- Campanhas com ciclo `draft -> running -> paused/resumed -> completed/canceled/failed`.
- Jobs de mensagem idempotentes por campanha/contato, prontos para BullMQ/Redis.
- Logs operacionais para campanha, conexão, fila e envio.
- SSE de snapshot para painel em tempo real.

## Fora do foco imediato

CRM avançado, billing, gamificação, IA avançada e automações visuais permanecem fora deste ciclo para manter foco absoluto nos disparos.
