import { ATTO_AI_SYSTEM_PROMPT } from '../prompts/system-prompts';
import type { AttoAiRequest, AttoAiResponse, AttoAiTenantContext } from '../types/ai.types';
import { AttoAiService } from './ai.service';

export class SummarizeService {
  constructor(private readonly ai = new AttoAiService()) {}

  summarizeConversation(context: Omit<AttoAiTenantContext, 'useCase'>, conversation: string): Promise<AttoAiResponse> {
    const request: AttoAiRequest = {
      context: { ...context, useCase: 'summarize-conversation' },
      messages: [
        { role: 'system', content: ATTO_AI_SYSTEM_PROMPT },
        { role: 'user', content: `Resuma a conversa comercial abaixo:\n\n${conversation}` },
      ],
      policy: { requireHumanApproval: false, dataSensitivity: 'high' },
    };

    return this.ai.generate(request);
  }
}
