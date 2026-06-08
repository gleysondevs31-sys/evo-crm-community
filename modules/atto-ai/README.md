# modules/atto-ai

`modules/atto-ai` é o módulo interno de inteligência artificial da **ATTO FLOW**.

Ele não deve ser tratado como produto visual separado. Outros módulos, como ATTOZAP, CRM, Automation, Reports e Gamification, consomem os serviços internos da ATTO AI para sugerir respostas, resumir conversas, classificar leads, criar campanhas, gerar relatórios e analisar performance.

## Estrutura

```text
/modules/atto-ai
  /providers
  /router
  /local
  /rag
  /memory
  /prompts
  /services
  /controllers
  /types
  index.ts
```

## Providers

- OpenAI.
- Anthropic Claude.
- Gemini.
- Groq.
- DeepSeek.
- OpenRouter.
- NVIDIA API.
- LLaMA local via GGUF, llama.cpp, node-llama-cpp ou Ollama.

## Regras

- Toda chamada exige `companyId` para isolamento multiempresa.
- Memória e RAG são separados por empresa, usuário e lead.
- O roteador escolhe modelos por política, custo, latência, disponibilidade e caso de uso.
- Fallback automático deve manter logs e rastreabilidade.
- Conteúdo externo para clientes deve exigir aprovação humana quando a política indicar `requireHumanApproval`.
