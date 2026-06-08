import { HUMAN_APPROVAL_REQUIRED_PROMPT } from '../prompts/safety-prompts';
import { ATTO_AI_SYSTEM_PROMPT } from '../prompts/system-prompts';
import type { AttoAiRequest, AttoAiResponse, AttoAiTenantContext } from '../types/ai.types';
import { AttoAiService } from './ai.service';

export class CampaignGeneratorService {
  constructor(private readonly ai = new AttoAiService()) {}

  generateCampaign(context: Omit<AttoAiTenantContext, 'useCase'>, objective: string): Promise<AttoAiResponse> {
    const request: AttoAiRequest = {
      context: { ...context, useCase: 'generate-campaign' },
      messages: [
        { role: 'system', content: ATTO_AI_SYSTEM_PROMPT },
        { role: 'system', content: HUMAN_APPROVAL_REQUIRED_PROMPT },
        { role: 'user', content: `Crie uma campanha comercial com objetivo:\n${objective}` },
      ],
      policy: { requireHumanApproval: true, enableStreaming: true, dataSensitivity: 'medium' },
    };

    return this.ai.generate(request);
  }
}
