import type { AttoAiProvider, AttoAiProviderName, AttoAiRequest, AttoAiRouteDecision } from '../types/ai.types';

const DEFAULT_USE_CASE_PROVIDERS: Partial<Record<string, AttoAiProviderName[]>> = {
  'suggest-whatsapp-reply': ['local-llama', 'openai', 'groq', 'openrouter'],
  'summarize-conversation': ['local-llama', 'anthropic', 'openai', 'gemini'],
  'classify-lead': ['local-llama', 'groq', 'openai', 'deepseek'],
  'generate-report': ['anthropic', 'openai', 'gemini', 'openrouter'],
  'automation-decision': ['local-llama', 'groq', 'deepseek', 'openai'],
  'generate-campaign': ['openai', 'anthropic', 'gemini', 'openrouter'],
};

export class ModelRouter {
  constructor(private readonly providers: AttoAiProvider[]) {}

  async choose(request: AttoAiRequest): Promise<AttoAiRouteDecision> {
    const available = await this.availableProviderNames();
    const allowed = request.policy?.allowedProviders ?? available;
    const preferred = request.policy?.preferredProvider;

    if (preferred && available.includes(preferred) && allowed.includes(preferred)) {
      return { provider: preferred, model: request.model, reason: 'company preferred provider' };
    }

    const useCaseOrder = DEFAULT_USE_CASE_PROVIDERS[request.context.useCase] ?? ['local-llama', 'openai', 'anthropic', 'openrouter'];
    const selected = useCaseOrder.find((provider) => available.includes(provider) && allowed.includes(provider));

    if (selected) {
      return { provider: selected, model: request.model, reason: `best default provider for ${request.context.useCase}` };
    }

    const fallback = available.find((provider) => allowed.includes(provider));
    if (!fallback) {
      throw new Error('No available ATTO AI provider matches the current company policy');
    }

    return { provider: fallback, model: request.model, reason: 'first available provider allowed by policy' };
  }

  private async availableProviderNames(): Promise<AttoAiProviderName[]> {
    const availability = await Promise.all(
      this.providers.map(async (provider) => ({ name: provider.name, available: await provider.isAvailable() })),
    );

    return availability.filter((provider) => provider.available).map((provider) => provider.name);
  }
}
