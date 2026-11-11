import { DatabaseSync } from 'node:sqlite';
import { Task, TaskStatus } from '@coagent/protocol';
import { CoAgentError } from '@coagent/shared';

interface TaskDbRow {
  id: string;
  parent_task_id: string | null;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  assigned_agent: string | null;
  target_model: string | null;
  depends_on: string;
  timeout_ms: number;
  max_retries: number;
  attempt_count: number;
  security_policy: string;
  metadata: string;
  result: string | null;
  error: string | null;
  approval_reason: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export class TaskRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRowToTask(row: TaskDbRow): Task {
    return {
      id: row.id,
      parentTaskId: row.parent_task_id ?? undefined,
      title: row.title,
      description: row.description,
      type: row.type as Task['type'],
      status: row.status as TaskStatus,
      priority: row.priority as Task['priority'],
      assignedAgent: row.assigned_agent ?? undefined,
      targetModel: row.target_model ?? undefined,
      dependsOn: JSON.parse(row.depends_on || '[]'),
      timeoutMs: row.timeout_ms,
      maxRetries: row.max_retries,
      attemptCount: row.attempt_count,
      securityPolicy: JSON.parse(row.security_policy || '{}'),
      metadata: JSON.parse(row.metadata || '{}'),
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ? JSON.parse(row.error) : undefined,
      approvalRequiredReason: row.approval_reason ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    };
  }

  public save(task: Task): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, parent_task_id, title, description, type, status, priority,
        assigned_agent, target_model, depends_on, timeout_ms, max_retries,
        attempt_count, security_policy, metadata, result, error, approval_reason,
        created_at, updated_at, started_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        parent_task_id = excluded.parent_task_id,
        title = excluded.title,
        description = excluded.description,
        type = excluded.type,
        status = excluded.status,
        priority = excluded.priority,
        assigned_agent = excluded.assigned_agent,
        target_model = excluded.target_model,
        depends_on = excluded.depends_on,
        timeout_ms = excluded.timeout_ms,
        max_retries = excluded.max_retries,
        attempt_count = excluded.attempt_count,
        security_policy = excluded.security_policy,
        metadata = excluded.metadata,
        result = excluded.result,
        error = excluded.error,
        approval_reason = excluded.approval_reason,
        updated_at = excluded.updated_at,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at
    `);

    stmt.run(
      task.id,
      task.parentTaskId ?? null,
      task.title,
      task.description ?? '',
      task.type,
      task.status,
      task.priority,
      task.assignedAgent ?? null,
      task.targetModel ?? null,
      JSON.stringify(task.dependsOn ?? []),
      task.timeoutMs ?? 300000,
      task.maxRetries ?? 2,
      task.attemptCount ?? 0,
      JSON.stringify(task.securityPolicy ?? {}),
      JSON.stringify(task.metadata ?? {}),
      task.result !== undefined ? JSON.stringify(task.result) : null,
      task.error ? JSON.stringify(task.error) : null,
      task.approvalRequiredReason ?? null,
      task.createdAt,
      task.updatedAt,
      task.startedAt ?? null,
      task.completedAt ?? null
    );
  }

  public findById(id: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as TaskDbRow | undefined;
    return row ? this.mapRowToTask(row) : null;
  }

  public findByStatus(status: TaskStatus): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC');
    const rows = stmt.all(status) as unknown as TaskDbRow[];
    return rows.map((r) => this.mapRowToTask(r));
  }

  public listAll(limit = 100): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as unknown as TaskDbRow[];
    return rows.map((r) => this.mapRowToTask(r));
  }

  public updateStatus(id: string, status: TaskStatus, updates?: Partial<Task>): void {
    const task = this.findById(id);
    if (!task) {
      throw new CoAgentError('TASK_NOT_FOUND', `Tarefa com ID ${id} não encontrada`);
    }

    const updatedTask: Task = {
      ...task,
      ...updates,
      status,
      updatedAt: new Date().toISOString(),
    };

    if (status === 'running' && !updatedTask.startedAt) {
      updatedTask.startedAt = updatedTask.updatedAt;
    } else if (['completed', 'failed', 'cancelled'].includes(status) && !updatedTask.completedAt) {
      updatedTask.completedAt = updatedTask.updatedAt;
    }

    this.save(updatedTask);
  }
}
