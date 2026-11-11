import { DatabaseSync } from 'node:sqlite';

export interface AgentSessionRecord {
  id: string;
  agentId: string;
  externalSessionId?: string;
  workingDirectory: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface SessionDbRow {
  id: string;
  agent_id: string;
  external_session_id: string | null;
  working_directory: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export class SessionRepository {
  constructor(private readonly db: DatabaseSync) {}

  public save(session: AgentSessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, agent_id, external_session_id, working_directory, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        external_session_id = excluded.external_session_id,
        working_directory = excluded.working_directory,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      session.id,
      session.agentId,
      session.externalSessionId ?? null,
      session.workingDirectory,
      JSON.stringify(session.metadata ?? {}),
      session.createdAt,
      session.updatedAt
    );
  }

  public findById(id: string): AgentSessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as SessionDbRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      agentId: row.agent_id,
      externalSessionId: row.external_session_id ?? undefined,
      workingDirectory: row.working_directory,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public findLatestByAgent(agentId: string): AgentSessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 1');
    const row = stmt.get(agentId) as SessionDbRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      agentId: row.agent_id,
      externalSessionId: row.external_session_id ?? undefined,
      workingDirectory: row.working_directory,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
