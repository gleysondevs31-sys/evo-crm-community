# ATTOZAP — módulo comercial da ATTO FLOW

Este diretório define a arquitetura-alvo da **ATTOZAP**, o módulo comercial da **ATTO FLOW** responsável por WhatsApp, CRM conversacional, campanhas, conexões e atendimento. A ATTOZAP não é a plataforma inteira: ela roda dentro da ATTO FLOW e consome módulos internos como CRM, Automation, Reports, Gamification e ATTO AI.

## Objetivo do módulo

Centralizar a operação comercial de empresas brasileiras dentro da ATTO FLOW, começando pelo mercado imobiliário e mantendo a arquitetura preparada para qualquer operação com funil comercial, WhatsApp, equipes, metas, relatórios, gamificação e automação.

Dentro da ATTO FLOW, a ATTOZAP deve unificar:

- CRM e pipeline Kanban.
- Atendimento e campanhas de WhatsApp.
- Gestão hierárquica de equipes.
- Automações visuais no estilo n8n.
- Metas, rankings, desafios e recompensas.
- Relatórios gerenciais e operacionais.
- Consumo da ATTO AI para inteligência assistiva, sempre com aprovação humana antes de responder clientes.

## Como usar o Evo CRM Community como base

O repositório atual deve funcionar como ponto de partida para orquestração e evolução do produto. A adaptação recomendada é:

| Base Evo CRM Community | Evolução ATTOZAP |
|---|---|
| CRM e conversas | Pipeline imobiliário/comercial, leads, histórico, tarefas, tags e documentos. |
| Auth/RBAC | Multiempresa, hierarquia corporativa e permissões por escopo. |
| Frontend web | Next.js, Tailwind, shadcn/ui, tema Dark Premium e UX SaaS 2026. |
| Processor/AI | ATTO AI como módulo interno da ATTO FLOW para sugestões, resumos, classificação e insights. |
| Bot runtime | Motor de automações visuais e execução assíncrona de fluxos. |
| Integrações | WhatsApp Baileys com processos independentes e core central por WebSocket. |

## Documentos principais

- [Arquitetura da plataforma](./architecture.md)
- [Modelo de dados e isolamento multi-tenant](./data-model.md)
- [Roadmap de implantação](./roadmap.md)

## Princípios arquiteturais dentro da ATTO FLOW

1. **Isolamento total por empresa**: todos os dados operacionais devem carregar `tenant_id`/`company_id` e passar por autorização de escopo.
2. **WhatsApp fora do Docker**: os processos Baileys devem rodar em PM2 no host Linux, com um processo e socket por número.
3. **ATTO AI assistiva, não autônoma**: a inteligência recomenda, resume e classifica, mas não fala diretamente com clientes sem autorização explícita.
4. **SQLite agora, PostgreSQL depois**: usar abstrações e migrations compatíveis para permitir migração para PostgreSQL sem reescrever domínio.
5. **Eventos primeiro**: CRM, WhatsApp, campanhas, automações, metas e gamificação devem publicar eventos internos auditáveis.
6. **Operação em tempo real**: status de conexões, filas, campanhas e dashboards devem usar WebSocket/SSE onde houver ganho operacional.
