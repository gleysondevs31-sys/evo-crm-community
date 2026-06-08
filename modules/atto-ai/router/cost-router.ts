import type { AttoAiProviderName, AttoAiRequest, AttoAiRouteDecision } from '../types/ai.types';

const ECONOMICAL_ORDER: AttoAiProviderName[] = ['local-llama', 'groq', 'deepseek', 'openrouter', 'gemini', 'openai', 'anthropic', 'nvidia'];

export class CostRouter {
  chooseLowestCost(availableProviders: AttoAiProviderName[], request: AttoAiRequest): AttoAiRouteDecision {
    const allowed = request.policy?.allowedProviders ?? availableProviders;
    const selected = ECONOMICAL_ORDER.find((provider) => availableProviders.includes(provider) && allowed.includes(provider));

    if (!selected) {
      throw new Error('No economical provider is available for this company policy');
    }

    return {
      provider: selected,
      model: request.model,
      reason: 'lowest-cost provider allowed by policy',
      estimatedCostUsd: selected === 'local-llama' ? 0 : undefined,
    };
  }
}
