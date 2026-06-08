import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class AnthropicProvider implements AttoAiProvider {
  readonly name = 'anthropic' as const;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey = process.env.ANTHROPIC_API_KEY) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    if (!(await this.isAvailable())) {
      throw new Error('Anthropic provider is not configured');
    }

    return {
      provider: this.name,
      model: request.model ?? 'claude-3-5-sonnet-latest',
      content: 'Anthropic provider adapter placeholder. Wire the official SDK in the app integration layer.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { companyId: request.context.companyId, useCase: request.context.useCase },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    const response = await this.generate(request);
    yield { provider: this.name, model: response.model, delta: response.content, done: true };
  }
}
