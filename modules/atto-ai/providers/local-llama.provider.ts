import { LlamaRunner } from '../local/llama-runner';
import type { AttoAiProvider, AttoAiRequest, AttoAiResponse, AttoAiStreamChunk } from '../types/ai.types';

export class LocalLlamaProvider implements AttoAiProvider {
  readonly name = 'local-llama' as const;
  readonly supportsStreaming = true;

  constructor(private readonly runner = new LlamaRunner()) {}

  async isAvailable(): Promise<boolean> {
    return this.runner.isAvailable();
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    const content = await this.runner.generate(request);

    return {
      provider: this.name,
      model: request.model ?? 'local-gguf',
      content,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      metadata: { runtime: this.runner.runtime, companyId: request.context.companyId },
    };
  }

  async *stream(request: AttoAiRequest): AsyncIterable<AttoAiStreamChunk> {
    for await (const delta of this.runner.stream(request)) {
      yield { provider: this.name, model: request.model ?? 'local-gguf', delta, done: false };
    }

    yield { provider: this.name, model: request.model ?? 'local-gguf', delta: '', done: true };
  }
}
