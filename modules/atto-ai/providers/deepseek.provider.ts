import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class DeepSeekProvider implements AttoAiProvider {
  readonly name = 'deepseek' as const;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey = process.env.DEEPSEEK_API_KEY) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    if (!(await this.isAvailable())) {
      throw new Error('DeepSeek provider is not configured');
    }

    return {
      provider: this.name,
      model: request.model ?? 'deepseek-chat',
      content: 'DeepSeek provider adapter placeholder. Use for reasoning and cost-sensitive workloads.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { companyId: request.context.companyId, useCase: request.context.useCase },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    const response = await this.generate(request);
    yield { provider: this.name, model: response.model, delta: response.content, done: true };
  }
}
