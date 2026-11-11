import { DatabaseSync } from 'node:sqlite';
import { generateId } from '@coagent/shared';

export interface AuditRecord {
  id: string;
  timestamp: string;
  eventType: string;
  agentId?: string;
  taskId?: string;
  details: Record<string, unknown>;
}

export class AuditRepository {
  constructor(private readonly db: DatabaseSync) {}

  public record(eventType: string, details: Record<string, unknown>, agentId?: string, taskId?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, event_type, agent_id, task_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      generateId('audit'),
      new Date().toISOString(),
      eventType,
      agentId ?? null,
      taskId ?? null,
      JSON.stringify(details)
    );
  }

  public listRecent(limit = 100): AuditRecord[] {
    const stmt = this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?');
    const rows = stmt.all(limit) as unknown as Array<{
      id: string;
      timestamp: string;
      event_type: string;
      agent_id: string | null;
      task_id: string | null;
      details: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      eventType: r.event_type,
      agentId: r.agent_id ?? undefined,
      taskId: r.task_id ?? undefined,
      details: JSON.parse(r.details || '{}'),
    }));
  }
}
