import { SessionRepository, AgentSessionRecord } from '@coagent/storage';
import { generateId, createLogger, Logger } from '@coagent/shared';

export class SessionManager {
  private readonly logger: Logger;

  constructor(private readonly sessionRepo: SessionRepository) {
    this.logger = createLogger('core:session-manager');
  }

  public getOrCreateSession(agentId: string, workingDirectory: string): AgentSessionRecord {
    const existing = this.sessionRepo.findLatestByAgent(agentId);
    if (existing && existing.workingDirectory === workingDirectory) {
      this.logger.debug(`Reaproveitando sessão existente do agente ${agentId}`, { sessionId: existing.id });
      return existing;
    }

    const now = new Date().toISOString();
    const newSession: AgentSessionRecord = {
      id: generateId('sess'),
      agentId,
      workingDirectory,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };

    this.sessionRepo.save(newSession);
    this.logger.info(`Nova sessão criada para o agente ${agentId}: ${newSession.id}`);
    return newSession;
  }

  public updateExternalSessionId(sessionId: string, externalSessionId: string): void {
    const session = this.sessionRepo.findById(sessionId);
    if (session) {
      session.externalSessionId = externalSessionId;
      session.updatedAt = new Date().toISOString();
      this.sessionRepo.save(session);
      this.logger.debug(`ExternalSessionId atualizado para sessão ${sessionId}: ${externalSessionId}`);
    }
  }

  public getSession(sessionId: string): AgentSessionRecord | null {
    return this.sessionRepo.findById(sessionId);
  }
}
