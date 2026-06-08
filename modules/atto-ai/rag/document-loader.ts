import type { AttoAiDocument } from '../types/ai.types';

export class DocumentLoader {
  fromText(companyId: string, id: string, title: string, content: string, metadata?: Record<string, unknown>): AttoAiDocument {
    return { companyId, id, title, content, metadata };
  }

  chunk(document: AttoAiDocument, maxCharacters = 2_000): AttoAiDocument[] {
    const chunks: AttoAiDocument[] = [];

    for (let index = 0; index < document.content.length; index += maxCharacters) {
      chunks.push({
        ...document,
        id: `${document.id}:chunk:${chunks.length + 1}`,
        content: document.content.slice(index, index + maxCharacters),
        metadata: { ...document.metadata, parentDocumentId: document.id, chunkIndex: chunks.length },
      });
    }

    return chunks;
  }
}
