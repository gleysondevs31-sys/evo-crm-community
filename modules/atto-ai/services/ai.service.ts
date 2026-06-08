import { AnthropicProvider } from '../providers/anthropic.provider';
import { DeepSeekProvider } from '../providers/deepseek.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import { GroqProvider } from '../providers/groq.provider';
import { LocalLlamaProvider } from '../providers/local-llama.provider';
import { NvidiaProvider } from '../providers/nvidia.provider';
import { OpenAiProvider } from '../providers/openai.provider';
import { OpenRouterProvider } from '../providers/openrouter.provider';
import { FallbackRouter } from '../router/fallback-router';
import { ModelRouter } from '../router/model-router';
import type { AttoAiProvider, AttoAiRequest, AttoAiResponse } from '../types/ai.types';

export class AttoAiService {
  private readonly modelRouter: ModelRouter;
  private readonly fallbackRouter: FallbackRouter;

  constructor(private readonly providers: AttoAiProvider[] = AttoAiService.defaultProviders()) {
    this.modelRouter = new ModelRouter(providers);
    this.fallbackRouter = new FallbackRouter(providers);
  }

  static defaultProviders(): AttoAiProvider[] {
    return [
      new LocalLlamaProvider(),
      new OpenAiProvider(),
      new AnthropicProvider(),
      new GeminiProvider(),
      new GroqProvider(),
      new DeepSeekProvider(),
      new OpenRouterProvider(),
      new NvidiaProvider(),
    ];
  }

  async generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    this.assertTenantContext(request);
    const decision = await this.modelRouter.choose(request);
    return this.fallbackRouter.generateWithFallback(decision.provider, { ...request, model: decision.model ?? request.model });
  }

  private assertTenantContext(request: AttoAiRequest): void {
    if (!request.context.companyId) {
      throw new Error('ATTO AI requires companyId for tenant isolation');
    }
  }
}
