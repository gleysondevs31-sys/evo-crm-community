export type AttoAiProviderName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'deepseek'
  | 'openrouter'
  | 'nvidia'
  | 'local-llama';

export type AttoAiModule =
  | 'attozap'
  | 'crm'
  | 'automation'
  | 'reports'
  | 'gamification'
  | 'platform';

export type AttoAiUseCase =
  | 'suggest-whatsapp-reply'
  | 'summarize-conversation'
  | 'classify-lead'
  | 'create-follow-up'
  | 'detect-objection'
  | 'score-lead'
  | 'suggest-next-action'
  | 'generate-report'
  | 'explain-metrics'
  | 'automation-decision'
  | 'generate-campaign'
  | 'generate-message'
  | 'performance-analysis'
  | 'rag-answer';

export interface AttoAiTenantContext {
  companyId: string;
  userId?: string;
  leadId?: string;
  module: AttoAiModule;
  useCase: AttoAiUseCase;
  traceId?: string;
}

export interface AttoAiPolicy {
  allowedProviders?: AttoAiProviderName[];
  preferredProvider?: AttoAiProviderName;
  allowLocalModels?: boolean;
  allowExternalProviders?: boolean;
  requireHumanApproval?: boolean;
  maxCostUsd?: number;
  maxLatencyMs?: number;
  enableStreaming?: boolean;
  dataSensitivity?: 'low' | 'medium' | 'high';
}

export interface AttoAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface AttoAiRequest {
  context: AttoAiTenantContext;
  messages: AttoAiMessage[];
  policy?: AttoAiPolicy;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface AttoAiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AttoAiResponse {
  provider: AttoAiProviderName;
  model: string;
  content: string;
  usage: AttoAiUsage;
  finishReason?: 'stop' | 'length' | 'tool-call' | 'error';
  metadata?: Record<string, unknown>;
}

export interface AttoAiStreamChunk {
  provider: AttoAiProviderName;
  model: string;
  delta: string;
  done: boolean;
}

export interface AttoAiProvider {
  readonly name: AttoAiProviderName;
  readonly supportsStreaming: boolean;
  isAvailable(): Promise<boolean>;
  generate(request: AttoAiRequest): Promise<AttoAiResponse>;
  stream?(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk>;
}

export interface AttoAiRouteDecision {
  provider: AttoAiProviderName;
  model?: string;
  reason: string;
  estimatedCostUsd?: number;
}

export interface AttoAiMemoryRecord {
  companyId: string;
  userId?: string;
  leadId?: string;
  namespace: 'company' | 'user' | 'lead';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface AttoAiDocument {
  companyId: string;
  id: string;
  title: string;
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
}
