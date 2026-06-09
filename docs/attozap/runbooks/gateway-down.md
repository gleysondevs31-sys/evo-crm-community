# Runbook: Gateway down

## Sintomas
- Alerta operacional aberto em `/api/disparos/alerts` ou degradação no `/api/disparos/ops-dashboard`.
- Métrica relacionada aparece em `/metrics` com valor acima do normal.

## Como detectar
- Consulte `GET /api/disparos/readiness` e `GET /api/disparos/health`.
- Filtre logs críticos por `connection.blocked`, `connection.degraded`, `message.failed`, `message.retrying` e `rate_limit.adapted`.

## Comando de diagnóstico
```bash
curl -s http://127.0.0.1:10000/api/disparos/ops-dashboard | jq
curl -s http://127.0.0.1:10000/metrics | rg 'attozap_'
```

## Impacto
- Disparos podem atrasar, pausar automaticamente ou ser bloqueados para proteger a linha WhatsApp e evitar duplicidade.

## Ação segura
- Resolva o blocker de infraestrutura primeiro.
- Se envolver sessão WhatsApp, valide QR/conexão no gateway antes de retomar campanhas.
- Execute `npm run reconcile:disparos` após restart ou inconsistência.

## O que não fazer
- Não limpar sessão ativa sem backup.
- Não forçar reenvio de jobs que já têm `providerMessageId`.
- Não reduzir delays de conexão degradada para “compensar” atraso.

## Como validar recuperação
- `GET /api/disparos/readiness` deve voltar com `ready=true` em produção.
- Alertas críticos devem estar resolvidos.
- `pendingAcks`, `stuckJobs` e `connectionsBlocked` devem cair para níveis esperados.
