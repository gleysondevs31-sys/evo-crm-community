import type { AttoAiDocument } from '../types/ai.types';

export interface VectorSearchResult {
  document: AttoAiDocument;
  score: number;
}

export class VectorStore {
  private readonly documents = new Map<string, AttoAiDocument>();

  async upsert(document: AttoAiDocument): Promise<void> {
    this.documents.set(`${document.companyId}:${document.id}`, document);
  }

  async search(companyId: string, query: string, limit = 5): Promise<VectorSearchResult[]> {
    const normalizedQuery = query.toLowerCase();

    return [...this.documents.values()]
      .filter((document) => document.companyId === companyId)
      .map((document) => ({ document, score: this.score(document, normalizedQuery) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private score(document: AttoAiDocument, normalizedQuery: string): number {
    const haystack = `${document.title}\n${document.content}`.toLowerCase();
    return normalizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  }
}
