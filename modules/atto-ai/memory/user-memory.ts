import type { AttoAiMemoryRecord } from '../types/ai.types';

export class UserMemory {
  private readonly records: AttoAiMemoryRecord[] = [];

  add(companyId: string, userId: string, content: string, metadata?: Record<string, unknown>): AttoAiMemoryRecord {
    const record: AttoAiMemoryRecord = { companyId, userId, namespace: 'user', content, metadata, createdAt: new Date() };
    this.records.push(record);
    return record;
  }

  list(companyId: string, userId: string): AttoAiMemoryRecord[] {
    return this.records.filter(
      (record) => record.companyId === companyId && record.userId === userId && record.namespace === 'user',
    );
  }
}
