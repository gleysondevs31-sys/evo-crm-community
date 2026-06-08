import type { AttoAiRequest, AttoAiResponse } from '../types/ai.types';
import { AttoAiService } from '../services/ai.service';

export class AttoAiController {
  constructor(private readonly ai = new AttoAiService()) {}

  /**
   * Internal controller entrypoint for ATTO FLOW modules.
   * Do not expose ATTO AI as a standalone user-facing product.
   */
  generate(request: AttoAiRequest): Promise<AttoAiResponse> {
    return this.ai.generate(request);
  }
}
