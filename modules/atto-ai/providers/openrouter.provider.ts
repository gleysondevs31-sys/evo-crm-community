import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class OpenRouterProvider implements AttoAiProvider {
  readonly name = 'openrouter' as const;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey = process.env.OPENROUTER_API_KEY) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    if (!(await this.isAvailable())) {
      throw new Error('OpenRouter provider is not configured');
    }

    return {
      provider: this.name,
      model: request.model ?? 'openrouter/auto',
      content: 'OpenRouter provider adapter placeholder. Use as multiprovider fallback broker.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { companyId: request.context.companyId, useCase: request.context.useCase },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    const response = await this.generate(request);
    yield { provider: this.name, model: response.model, delta: response.content, done: true };
  }
}
