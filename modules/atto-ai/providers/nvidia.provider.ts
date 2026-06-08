import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class NvidiaProvider implements AttoAiProvider {
  readonly name = 'nvidia' as const;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey = process.env.NVIDIA_API_KEY) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    if (!(await this.isAvailable())) {
      throw new Error('NVIDIA provider is not configured');
    }

    return {
      provider: this.name,
      model: request.model ?? 'nvidia/llama-3.1-nemotron-70b-instruct',
      content: 'NVIDIA provider adapter placeholder. Use for GPU-accelerated model API workloads.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { companyId: request.context.companyId, useCase: request.context.useCase },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    const response = await this.generate(request);
    yield { provider: this.name, model: response.model, delta: response.content, done: true };
  }
}
