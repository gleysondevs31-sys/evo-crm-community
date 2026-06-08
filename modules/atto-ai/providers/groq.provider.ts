import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class GroqProvider implements AttoAiProvider {
  readonly name = 'groq' as const;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey = process.env.GROQ_API_KEY) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    if (!(await this.isAvailable())) {
      throw new Error('Groq provider is not configured');
    }

    return {
      provider: this.name,
      model: request.model ?? 'llama-3.1-70b-versatile',
      content: 'Groq provider adapter placeholder. Use for low-latency hosted open model inference.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { companyId: request.context.companyId, useCase: request.context.useCase },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    const response = await this.generate(request);
    yield { provider: this.name, model: response.model, delta: response.content, done: true };
  }
}
