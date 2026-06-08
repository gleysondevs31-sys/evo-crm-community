import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class OpenAiProvider implements AttoAiProvider {
  readonly name = 'openai' as const;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey = process.env.OPENAI_API_KEY) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    if (!(await this.isAvailable())) {
      throw new Error('OpenAI provider is not configured');
    }

    return {
      provider: this.name,
      model: request.model ?? 'gpt-4.1-mini',
      content: 'OpenAI provider adapter placeholder. Wire the official SDK in the app integration layer.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { companyId: request.context.companyId, useCase: request.context.useCase },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    const response = await this.generate(request);
    yield { provider: this.name, model: response.model, delta: response.content, done: true };
  }
}
