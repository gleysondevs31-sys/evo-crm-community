# Deploy da ATTO FLOW na Render

Este repositório possui um **Dockerfile na raiz** para evitar o erro da Render:

```text
failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

A Render procura `./Dockerfile` por padrão. O Dockerfile raiz sobe o MVP modular da **ATTO FLOW Community** (`apps/api` servindo a UI de `apps/web`) sem depender dos submodules nem dos Dockerfiles dos serviços Evo.

## Serviço criado

- Tipo: Web Service.
- Runtime: Docker.
- Dockerfile: `./Dockerfile`.
- Health check: `/healthz`.
- Porta: variável `PORT` da Render, com fallback local `10000`.

## Rotas úteis

| Rota | Uso |
|---|---|
| `/` | Interface inicial da ATTO FLOW servida pela API. |
| `/healthz` | Health check da Render. |
| `/api/status` | Status JSON da API modular. |
| `/api/dashboard` | Métricas iniciais do CRM/ATTOZAP/relatórios. |
| `/api/crm/leads` | Leads do CRM. |
| `/api/attozap/inbox` | Inbox comercial do ATTOZAP. |
| `/api/atto-ai/logs` | Logs de uso da ATTO AI interna. |

## Deploy via Dashboard

1. Conecte o repositório na Render.
2. Crie um **Web Service**.
3. Escolha **Docker** como runtime.
4. Confirme que o Dockerfile path é `./Dockerfile`.
5. Configure o health check path como `/healthz`.
6. Deploy.

## Deploy via Blueprint

O arquivo `render.yaml` já define o serviço `atto-flow-preview`. Use **New + Blueprint** na Render e selecione este repositório.

## Teste local com Docker

```bash
docker build -t atto-flow .
docker run --rm -p 10000:10000 atto-flow
curl http://localhost:10000/healthz
```

## Teste local sem Docker

```bash
PORT=10000 node apps/api/server.js
curl http://localhost:10000/healthz
```

## Próximos passos

Este MVP já sobe `apps/api`, serve a UI inicial em `apps/web` e usa módulos internos em memória. A evolução natural é substituir os stores em memória por `packages/database` persistente com migrations e ativar workers reais em `apps/workers`.
