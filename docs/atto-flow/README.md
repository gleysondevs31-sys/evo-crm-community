# ATTO FLOW — Plataforma SaaS modular

A **ATTO FLOW** é a plataforma principal da operação. Ela centraliza automação, CRM, WhatsApp, atendimento, campanhas, gestão de leads, equipes, produtividade comercial, relatórios, gamificação e inteligência artificial.

A ATTO FLOW não deve ser apresentada como um conjunto de produtos soltos. Para o usuário final, ela é uma única plataforma SaaS modular. Internamente, cada domínio fica isolado em módulos para permitir evolução, escala e manutenção independente.

## Módulos principais

| Módulo | Papel dentro da ATTO FLOW |
|---|---|
| **ATTOZAP** | WhatsApp, conexões, QR Code, atendimento, CRM conversacional, campanhas e gestão comercial. |
| **ATTO AI** | Camada interna de inteligência artificial, roteador de modelos, LLaMA local, provedores externos, RAG, memória e automações inteligentes. |
| **CRM** | Leads, funil, histórico, tarefas, notas, tags e próximas ações. |
| **Automation** | Workflows visuais, gatilhos, condições, ações, filas e execução assíncrona. |
| **Reports** | Relatórios, métricas, exportações e explicações executivas apoiadas por IA. |
| **Gamification** | Metas, pontuação, rankings, recompensas e desafios comerciais. |

## Estrutura-alvo do monorepo

```text
/atto-flow
  /apps
    /web
    /api
    /workers
  /modules
    /attozap
    /atto-ai
    /crm
    /automation
    /reports
    /gamification
  /packages
    /database
    /auth
    /queue
    /logger
    /config
    /ui
```

Neste repositório, a estrutura modular começa por `modules/atto-ai` e deve crescer para os demais módulos conforme a migração do Evo CRM Community para ATTO FLOW avançar.

## Regra de produto

A **ATTO AI não é um produto visual separado**. Ela é o cérebro interno da ATTO FLOW e deve ser consumida pelos módulos da plataforma por serviços internos, jobs, automações e APIs autenticadas.

Exemplos:

- ATTOZAP chama ATTO AI para sugerir respostas, resumir conversas, classificar intenção, criar follow-ups e detectar objeções.
- CRM chama ATTO AI para pontuar leads, sugerir próxima ação, resumir histórico e criar anotações automáticas.
- Gestão chama ATTO AI para gerar relatórios, analisar produtividade, explicar métricas e gerar insights.
- Automation chama ATTO AI para decidir fluxo, interpretar mensagens, gerar conteúdo e classificar eventos.

## Princípios técnicos

1. **Modularidade por domínio**: cada módulo expõe serviços internos claros e não depende de detalhes de implementação de outro módulo.
2. **IA como camada interna**: ATTO AI é acessada por módulos, não como app isolado para usuários finais.
3. **Multiempresa por padrão**: toda chamada carrega contexto de empresa, usuário, permissões e rastreabilidade.
4. **Roteamento inteligente de modelos**: cada tarefa pode escolher o melhor provedor por custo, latência, qualidade, disponibilidade e política da empresa.
5. **Fallback automático**: falhas de provedor devem acionar rotas alternativas seguras e auditáveis.
6. **Local-first quando fizer sentido**: LLaMA local via GGUF, llama.cpp, node-llama-cpp ou Ollama deve ser suportado para privacidade, custo e resiliência.
7. **RAG e memória controlados por tenant**: documentos, embeddings, histórico e memória nunca podem vazar entre empresas.
