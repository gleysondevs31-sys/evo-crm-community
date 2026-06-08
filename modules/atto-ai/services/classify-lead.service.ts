import { LEAD_CLASSIFICATION_PROMPT } from '../prompts/sales-prompts';
import { ATTO_AI_SYSTEM_PROMPT } from '../prompts/system-prompts';
import type { AttoAiRequest, AttoAiResponse, AttoAiTenantContext } from '../types/ai.types';
import { AttoAiService } from './ai.service';

export class ClassifyLeadService {
  constructor(private readonly ai = new AttoAiService()) {}

  classifyLead(context: Omit<AttoAiTenantContext, 'useCase'>, leadHistory: string): Promise<AttoAiResponse> {
    const request: AttoAiRequest = {
      context: { ...context, useCase: 'classify-lead' },
      messages: [
        { role: 'system', content: ATTO_AI_SYSTEM_PROMPT },
        { role: 'system', content: LEAD_CLASSIFICATION_PROMPT },
        { role: 'user', content: leadHistory },
      ],
      policy: { requireHumanApproval: false, dataSensitivity: 'high' },
    };

    return this.ai.generate(request);
  }
}
