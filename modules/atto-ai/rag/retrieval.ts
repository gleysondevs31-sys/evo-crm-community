import { VectorStore, type VectorSearchResult } from './vector-store';

export class RetrievalService {
  constructor(private readonly vectorStore = new VectorStore()) {}

  retrieveCompanyKnowledge(companyId: string, query: string, limit = 5): Promise<VectorSearchResult[]> {
    return this.vectorStore.search(companyId, query, limit);
  }
}
