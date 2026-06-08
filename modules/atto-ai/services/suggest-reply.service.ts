import { SALES_REPLY_PROMPT } from '../prompts/sales-prompts';
import { HUMAN_APPROVAL_REQUIRED_PROMPT } from '../prompts/safety-prompts';
import { ATTO_AI_SYSTEM_PROMPT } from '../prompts/system-prompts';
import type { AttoAiRequest, AttoAiResponse, AttoAiTenantContext } from '../types/ai.types';
import { AttoAiService } from './ai.service';

export class SuggestReplyService {
  constructor(private readonly ai = new AttoAiService()) {}

  suggestWhatsAppReply(context: Omit<AttoAiTenantContext, 'useCase'>, conversation: string): Promise<AttoAiResponse> {
    const request: AttoAiRequest = {
      context: { ...context, useCase: 'suggest-whatsapp-reply' },
      messages: [
        { role: 'system', content: ATTO_AI_SYSTEM_PROMPT },
        { role: 'system', content: SALES_REPLY_PROMPT },
        { role: 'system', content: HUMAN_APPROVAL_REQUIRED_PROMPT },
        { role: 'user', content: `Sugira uma resposta para a conversa de WhatsApp:\n\n${conversation}` },
      ],
      policy: { requireHumanApproval: true, enableStreaming: true, dataSensitivity: 'high' },
    };

    return this.ai.generate(request);
  }
}
