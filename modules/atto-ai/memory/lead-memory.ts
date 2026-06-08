import type { AttoAiMemoryRecord } from '../types/ai.types';

export class LeadMemory {
  private readonly records: AttoAiMemoryRecord[] = [];

  add(companyId: string, leadId: string, content: string, metadata?: Record<string, unknown>): AttoAiMemoryRecord {
    const record: AttoAiMemoryRecord = { companyId, leadId, namespace: 'lead', content, metadata, createdAt: new Date() };
    this.records.push(record);
    return record;
  }

  list(companyId: string, leadId: string): AttoAiMemoryRecord[] {
    return this.records.filter(
      (record) => record.companyId === companyId && record.leadId === leadId && record.namespace === 'lead',
    );
  }
}
