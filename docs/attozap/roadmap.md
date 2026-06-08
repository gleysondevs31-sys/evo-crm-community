# Roadmap ATTOZAP

## Fase 0 — Preparação da base

Objetivo: transformar o Evo CRM Community em fundação do produto ATTOZAP.

Entregas:

- Definir branding ATTOZAP.
- Definir arquitetura multi-tenant.
- Definir papéis e permissões.
- Definir modelo de dados inicial.
- Definir estratégia SQLite → PostgreSQL.
- Definir integração WhatsApp Baileys fora do Docker.
- Criar design system Dark Premium.

Critério de aceite:

- Documentação arquitetural aprovada.
- Backlog técnico dividido por módulos.
- Contratos principais de API definidos.

## Fase 1 — MVP operacional

Objetivo: entregar CRM multiempresa com WhatsApp conectado.

Entregas:

- Login, empresas, usuários e hierarquia básica.
- Pipeline Kanban padrão.
- Cadastro e edição de leads.
- Histórico, tags e anotações.
- Central de conexões WhatsApp.
- QR Code em tempo real.
- Um processo PM2 por número Baileys.
- Inbox básica de mensagens.
- Envio individual.
- Dashboard inicial.

Critério de aceite:

- Empresa consegue cadastrar usuários, conectar número, receber lead, conversar pelo WhatsApp e mover lead no Kanban.

## Fase 2 — Campanhas e produtividade

Objetivo: aumentar operação comercial e cadência de atendimento.

Entregas:

- Campanhas WhatsApp.
- Segmentação por tags, estágio, origem e corretor.
- Filas de envio com pausa, retomada e cancelamento.
- Agendamento de campanha.
- Tarefas comerciais.
- Tempo médio de resposta.
- Relatórios básicos por corretor e equipe.

Critério de aceite:

- Gerente consegue disparar campanha controlada, acompanhar status e medir conversão por equipe.

## Fase 3 — Automações e CPF

Objetivo: automatizar tarefas repetitivas e suportar fluxo imobiliário.

Entregas:

- Criador visual de automações.
- Gatilhos: lead criado, etapa alterada, mensagem recebida e atraso de resposta.
- Ações: enviar mensagem, mover etapa, criar tarefa, notificar e adicionar tag.
- Configuração de grupo de CPF.
- Configuração de grupo de aquecimento.
- Consulta CPF vinculada ao lead.
- Captura de texto e imagem como resposta.

Critério de aceite:

- Corretor consulta CPF pelo lead e o resultado retorna automaticamente para o CRM.

## Fase 4 — Metas e gamificação

Objetivo: transformar produtividade em rotina mensurável e motivadora.

Entregas:

- Metas individuais.
- Metas por equipe.
- Metas por empresa.
- Pontuação por evento.
- Ranking diário, semanal e mensal.
- Desafios do dia.
- Loja de prêmios.
- Resgate de recompensas.

Critério de aceite:

- Usuários visualizam ranking e pontuação em tempo real, com metas refletindo eventos do CRM.

## Fase 5 — ATTOZAP AI

Objetivo: elevar qualidade de atendimento e inteligência comercial.

Entregas:

- Sugestão de respostas.
- Resumo de conversas.
- Classificação de intenção.
- Análise de lead.
- Geração de mensagens para campanhas.
- Recomendações comerciais.
- Insights de vendas.
- Políticas de aprovação humana.

Critério de aceite:

- Corretor recebe sugestões úteis e pode aprovar/editar antes de enviar ao cliente.

## Fase 6 — Escala SaaS

Objetivo: preparar operação nacional e crescimento multi-segmento.

Entregas:

- Migração opcional para PostgreSQL.
- Separação de workers críticos.
- Observabilidade avançada.
- Planos e billing.
- Feature flags por plano.
- Exportações PDF, Excel e CSV.
- Relatórios executivos avançados.
- Sharding de processos WhatsApp por host.

Critério de aceite:

- Plataforma suporta múltiplas empresas com isolamento, estabilidade, monitoramento e cobrança recorrente.

## Backlog técnico inicial

### Plataforma

- Criar módulo `tenancy`.
- Criar módulo `identity` com hierarquia.
- Criar middleware de contexto de empresa.
- Criar auditoria global.

### CRM

- Criar pipeline padrão configurável.
- Criar lead completo.
- Criar histórico de eventos do lead.
- Criar Kanban com drag and drop.

### WhatsApp

- Criar core WebSocket.
- Criar supervisor PM2.
- Criar worker Baileys por conexão.
- Criar fila de envio BullMQ.
- Criar health check por número.

### Automação

- Definir schema de grafo.
- Criar executor de flows.
- Criar logs por execução.
- Criar editor visual.

### IA

- Criar gateway de IA.
- Criar templates de prompt por caso de uso.
- Criar política de aprovação humana.
- Criar logs com mascaramento de CPF e telefone.

### UX/UI

- Criar design tokens Dark Premium.
- Criar layout com sidebar.
- Criar cards e gráficos base.
- Criar telas responsivas para dashboard, CRM e conexões.
