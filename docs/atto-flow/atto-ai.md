# ATTO AI — módulo interno da ATTO FLOW

A **ATTO AI** é o módulo interno de inteligência artificial da ATTO FLOW. Ela serve ATTOZAP, CRM, automações, relatórios, gamificação e painel de gestão sem se apresentar como produto separado ao usuário final.

## Responsabilidades

- Roteador inteligente de modelos.
- Fallback automático entre provedores.
- Streaming de resposta.
- Controle de custos por empresa, usuário, módulo e caso de uso.
- Logs de uso com mascaramento de dados sensíveis.
- Segurança por empresa e política de permissões.
- Memória por empresa, usuário e lead.
- RAG com documentos internos.
- Base de conhecimento por empresa.
- Sugestões comerciais.
- Resumo de conversas.
- Classificação de leads.
- Criação de campanhas.
- Geração de mensagens.
- Análise de performance.

## Provedores suportados

| Provider | Uso esperado |
|---|---|
| LLaMA local | Privacidade, baixo custo recorrente, execução local CPU/GPU e tarefas internas. |
| OpenAI | Alta qualidade geral, respostas comerciais, resumos e geração. |
| Anthropic Claude | Análise longa, raciocínio, relatórios e segurança. |
| Gemini | Multimodalidade, documentos e integrações Google. |
| Groq | Baixa latência para modelos open-source hospedados. |
| DeepSeek | Raciocínio e custo competitivo. |
| OpenRouter | Multiprovedor e fallback flexível. |
| NVIDIA API | Modelos acelerados e workloads otimizados por GPU. |

## LLaMA local

A ATTO AI deve suportar modelos **GGUF** por três caminhos compatíveis:

1. `llama.cpp` para execução/compilação nativa em CPU ou GPU.
2. `node-llama-cpp` para integração direta em Node.js.
3. `Ollama` para ambientes em que o operador prefira um runtime local gerenciado.

O módulo `local` deve detectar hardware disponível, decidir CPU/GPU, validar binários e expor um runner padronizado para o roteador.

## Roteamento

O roteador escolhe o provider com base em:

- Caso de uso: sugestão de resposta, resumo, classificação, campanha, relatório, RAG ou análise.
- Política da empresa.
- Custo máximo permitido.
- Latência desejada.
- Necessidade de streaming.
- Disponibilidade do provider.
- Sensibilidade dos dados.
- Tamanho do contexto.

Fluxo recomendado:

```text
módulo consumidor → ai.service → model-router → provider primário
                                      ↓ falha
                                fallback-router → provider alternativo
                                      ↓ custo alto
                                cost-router → provider econômico/local
```

## Segurança multiempresa

Toda chamada deve carregar:

- `companyId`.
- `userId` quando existir usuário humano.
- `leadId` quando houver contexto comercial.
- `module` chamador.
- `useCase`.
- permissões e política da empresa.

A ATTO AI nunca deve recuperar memória, documentos, embeddings ou logs de outra empresa.

## Uso por módulo

### ATTOZAP

- Sugerir resposta para WhatsApp.
- Resumir conversa.
- Classificar intenção do lead.
- Criar follow-up.
- Detectar objeção.

### CRM

- Pontuar leads.
- Sugerir próxima ação.
- Resumir histórico.
- Criar anotações automáticas.

### Painel de gestão

- Gerar relatórios.
- Analisar produtividade.
- Explicar métricas.
- Gerar insights.

### Automação

- Decidir fluxo.
- Interpretar mensagens.
- Gerar conteúdo.
- Classificar eventos.
