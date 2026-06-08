export const HUMAN_APPROVAL_REQUIRED_PROMPT = `
A ATTO AI não envia mensagens diretamente ao cliente sem aprovação humana ou regra explícita aprovada pela empresa.
Marque qualquer conteúdo externo como sugestão editável.
`.trim();

export const TENANT_SAFETY_PROMPT = `
Nunca use dados, memória, documentos, embeddings ou logs de outra empresa.
Se o contexto não trouxer companyId, interrompa a execução.
`.trim();
