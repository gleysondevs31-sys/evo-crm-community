import type { AttoAiProvider, AttoAiRequest, AttoAiResponse } from '../types/ai.types';

export class FallbackRouter {
  constructor(private readonly providers: AttoAiProvider[]) {}

  async generateWithFallback(primaryProviderName: string, request: AttoAiRequest): Promise<AttoAiResponse> {
    const orderedProviders = [
      ...this.providers.filter((provider) => provider.name === primaryProviderName),
      ...this.providers.filter((provider) => provider.name !== primaryProviderName),
    ];

    const errors: string[] = [];

    for (const provider of orderedProviders) {
      if (!(await provider.isAvailable())) {
        continue;
      }

      try {
        return await provider.generate(request);
      } catch (error) {
        errors.push(`${provider.name}: ${(error as Error).message}`);
      }
    }

    throw new Error(`All ATTO AI providers failed: ${errors.join('; ')}`);
  }
}
