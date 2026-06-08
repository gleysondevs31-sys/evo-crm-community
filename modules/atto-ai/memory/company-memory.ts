import type { AttoAiMemoryRecord } from '../types/ai.types';

export class CompanyMemory {
  private readonly records: AttoAiMemoryRecord[] = [];

  add(companyId: string, content: string, metadata?: Record<string, unknown>): AttoAiMemoryRecord {
    const record: AttoAiMemoryRecord = { companyId, namespace: 'company', content, metadata, createdAt: new Date() };
    this.records.push(record);
    return record;
  }

  list(companyId: string): AttoAiMemoryRecord[] {
    return this.records.filter((record) => record.companyId === companyId && record.namespace === 'company');
  }
}
