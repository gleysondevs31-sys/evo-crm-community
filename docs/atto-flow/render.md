# Deploy da ATTO FLOW na Render

Este repositório possui um **Dockerfile na raiz** para evitar o erro da Render:

```text
failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

A Render procura `./Dockerfile` por padrão. O Dockerfile raiz sobe um preview leve da **ATTO FLOW Community** sem depender dos submodules nem dos Dockerfiles dos serviços Evo.

## Serviço criado

- Tipo: Web Service.
- Runtime: Docker.
- Dockerfile: `./Dockerfile`.
- Health check: `/healthz`.
- Porta: variável `PORT` da Render, com fallback local `10000`.

## Rotas úteis

| Rota | Uso |
|---|---|
| `/` | Landing page de preview ATTO FLOW. |
| `/healthz` | Health check da Render. |
| `/api/status` | Status JSON do preview. |
| `/api/modules` | Lista de módulos internos. |
| `/docs/atto-flow` | Documentação ATTO FLOW em JSON. |
| `/docs/atto-ai` | Documentação ATTO AI em JSON. |
| `/docs/attozap` | Documentação ATTOZAP em JSON. |

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
docker build -t atto-flow-preview .
docker run --rm -p 10000:10000 atto-flow-preview
curl http://localhost:10000/healthz
```

## Teste local sem Docker

```bash
PORT=10000 node apps/render-preview/server.js
curl http://localhost:10000/healthz
```

## Próximos passos

Este preview é uma base de validação para Render. A evolução natural é plugar os módulos reais da ATTO FLOW em `apps/api`, `apps/web`, `apps/workers` e substituir gradualmente o preview por serviços produtivos.
