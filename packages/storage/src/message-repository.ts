import { DatabaseSync } from 'node:sqlite';
import { AgentMessage, MessageStatus } from '@coagent/protocol';

interface MessageDbRow {
  id: string;
  task_id: string;
  correlation_id: string;
  source: string;
  target: string;
  type: string;
  payload: string;
  context_ref: string | null;
  requires_response: number;
  timestamp: string;
  status: string;
}

export class MessageRepository {
  constructor(private readonly db: DatabaseSync) {}

  public save(message: AgentMessage): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, task_id, correlation_id, source, target, type,
        payload, context_ref, requires_response, timestamp, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status
    `);

    stmt.run(
      message.id,
      message.taskId,
      message.correlationId,
      message.source,
      message.target,
      message.type,
      JSON.stringify(message.payload),
      message.contextRef ?? null,
      message.requiresResponse ? 1 : 0,
      message.timestamp,
      message.status
    );
  }

  public findByTaskId(taskId: string): AgentMessage[] {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY timestamp ASC');
    const rows = stmt.all(taskId) as unknown as MessageDbRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      correlationId: r.correlation_id,
      source: r.source,
      target: r.target,
      type: r.type as AgentMessage['type'],
      payload: JSON.parse(r.payload),
      contextRef: r.context_ref ?? undefined,
      requiresResponse: r.requires_response === 1,
      timestamp: r.timestamp,
      status: r.status as MessageStatus,
    }));
  }
}
