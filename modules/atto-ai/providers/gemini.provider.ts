import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class GeminiProvider implements AttoAiProvider {
  readonly name = 'gemini' as const;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey = process.env.GEMINI_API_KEY) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    if (!(await this.isAvailable())) {
      throw new Error('Gemini provider is not configured');
    }

    return {
      provider: this.name,
      model: request.model ?? 'gemini-1.5-flash',
      content: 'Gemini provider adapter placeholder. Wire the Google GenAI SDK in the app integration layer.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { companyId: request.context.companyId, useCase: request.context.useCase },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    const response = await this.generate(request);
    yield { provider: this.name, model: response.model, delta: response.content, done: true };
  }
}
