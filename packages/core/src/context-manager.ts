import { generateId, createLogger, Logger } from '@coagent/shared';

export interface ContextItem {
  id: string;
  key: string;
  content: string;
  summary?: string;
  tags: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class ContextManager {
  private readonly items = new Map<string, ContextItem>();
  private readonly keyIndex = new Map<string, string>(); // key -> id
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger('core:context-manager');
  }

  public storeContext(
    key: string,
    content: string,
    options?: { summary?: string; tags?: string[]; metadata?: Record<string, unknown> }
  ): ContextItem {
    const id = generateId('ctx');
    const item: ContextItem = {
      id,
      key,
      content,
      summary: options?.summary,
      tags: options?.tags ?? [],
      metadata: options?.metadata,
      createdAt: new Date().toISOString(),
    };

    this.items.set(id, item);
    this.keyIndex.set(key, id);
    this.logger.debug(`Contexto armazenado: [${key}] (${content.length} caracteres)`);

    return item;
  }

  public getContextById(id: string): ContextItem | null {
    return this.items.get(id) ?? null;
  }

  public getContextByKey(key: string): ContextItem | null {
    const id = this.keyIndex.get(key);
    return id ? this.getContextById(id) : null;
  }

  public getSelectiveContext(refs: string[], useSummaryOnly = false): string {
    const parts: string[] = [];

    for (const ref of refs) {
      const item = this.getContextByKey(ref) ?? this.getContextById(ref);
      if (item) {
        if (useSummaryOnly && item.summary) {
          parts.push(`### Contexto [${item.key} - Resumo]:\n${item.summary}`);
        } else {
          parts.push(`### Contexto [${item.key}]:\n${item.content}`);
        }
      }
    }

    return parts.join('\n\n---\n\n');
  }

  public clear(): void {
    this.items.clear();
    this.keyIndex.clear();
  }
}
