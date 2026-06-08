import { existsSync } from 'node:fs';
import { HardwareDetector } from './hardware-detector';
import type { AttoAiRequest } from '../types/ai.types';

export type LocalLlamaRuntime = 'llama.cpp' | 'node-llama-cpp' | 'ollama';

export class LlamaRunner {
  readonly runtime: LocalLlamaRuntime;

  constructor(
    runtime: LocalLlamaRuntime = (process.env.ATTO_AI_LLAMA_RUNTIME as LocalLlamaRuntime) || 'ollama',
    private readonly modelPath = process.env.ATTO_AI_GGUF_MODEL_PATH,
    private readonly detector = new HardwareDetector(),
  ) {
    this.runtime = runtime;
  }

  async isAvailable(): Promise<boolean> {
    if (this.runtime === 'ollama') {
      return Boolean(process.env.OLLAMA_HOST || process.env.ATTO_AI_ENABLE_OLLAMA === 'true');
    }

    if (this.runtime === 'llama.cpp' || this.runtime === 'node-llama-cpp') {
      return Boolean(this.modelPath && existsSync(this.modelPath));
    }

    return false;
  }

  async generate(request: AttoAiRequest): Promise<string> {
    const profile = this.detector.detect();
    const prompt = request.messages.map((message) => `${message.role}: ${message.content}`).join('\n');

    return [
      'Local LLaMA runner placeholder.',
      `Runtime: ${this.runtime}.`,
      `Backend: ${profile.recommendedBackend}.`,
      `Model: ${request.model ?? this.modelPath ?? 'not-selected'}.`,
      `Prompt characters: ${prompt.length}.`,
    ].join(' ');
  }

  async *stream(request: AttoAiRequest): AsyncIterable<string> {
    const response = await this.generate(request);
    yield response;
  }
}
