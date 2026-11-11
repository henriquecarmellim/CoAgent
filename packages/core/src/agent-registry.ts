import { AgentMetadata, AgentStatus, TaskType } from '@coagent/protocol';
import { createLogger, Logger, CoAgentError } from '@coagent/shared';
import { EventBus } from './event-bus.js';

export class AgentRegistry {
  private readonly agents = new Map<string, AgentMetadata>();
  private readonly logger: Logger;

  constructor(private readonly eventBus?: EventBus) {
    this.logger = createLogger('core:agent-registry');
  }

  public register(metadata: AgentMetadata): void {
    if (this.agents.has(metadata.id)) {
      this.logger.warn(`Agente ${metadata.id} já registrado. Atualizando metadados.`);
    }

    this.agents.set(metadata.id, {
      ...metadata,
      lastActiveAt: new Date().toISOString(),
    });

    this.logger.info(`Agente registrado com sucesso: ${metadata.name} (${metadata.id})`, {
      provider: metadata.provider,
      capabilities: metadata.capabilities.supportedTaskTypes,
    });

    this.eventBus?.emitEvent('agent:registered', {
      agentId: metadata.id,
      name: metadata.name,
      provider: metadata.provider,
    });
  }

  public unregister(agentId: string): boolean {
    const deleted = this.agents.delete(agentId);
    if (deleted) {
      this.logger.info(`Agente desregistrado: ${agentId}`);
    }
    return deleted;
  }

  public getAgent(agentId: string): AgentMetadata | null {
    return this.agents.get(agentId) ?? null;
  }

  public getAgentOrThrow(agentId: string): AgentMetadata {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new CoAgentError('AGENT_NOT_FOUND', `Agente com ID '${agentId}' não foi encontrado no registro.`);
    }
    return agent;
  }

  public listAgents(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  public findAvailableAgentsForTask(taskType: TaskType): AgentMetadata[] {
    return this.listAgents().filter((agent) => {
      const isOnline = agent.status === 'idle' || agent.status === 'busy';
      const hasCapacity = agent.activeTasksCount < agent.capabilities.maxConcurrency;
      const supportsType = agent.capabilities.supportedTaskTypes.includes(taskType);
      return isOnline && hasCapacity && supportsType;
    });
  }

  public updateStatus(agentId: string, status: AgentStatus, currentTaskId?: string | null): void {
    const agent = this.getAgentOrThrow(agentId);
    const prevStatus = agent.status;

    agent.status = status;
    agent.lastActiveAt = new Date().toISOString();
    if (currentTaskId !== undefined) {
      agent.currentTaskId = currentTaskId;
    }

    if (prevStatus !== status) {
      this.logger.debug(`Status do agente ${agentId} alterado: ${prevStatus} -> ${status}`);
      this.eventBus?.emitEvent(
        'agent:status_changed',
        { previousStatus: prevStatus, newStatus: status },
        { agentId }
      );
    }
  }

  public incrementActiveTasks(agentId: string): void {
    const agent = this.getAgentOrThrow(agentId);
    agent.activeTasksCount += 1;
    if (agent.activeTasksCount >= agent.capabilities.maxConcurrency) {
      this.updateStatus(agentId, 'busy');
    }
  }

  public decrementActiveTasks(agentId: string, completedSuccessfully: boolean): void {
    const agent = this.getAgentOrThrow(agentId);
    agent.activeTasksCount = Math.max(0, agent.activeTasksCount - 1);
    if (completedSuccessfully) {
      agent.totalTasksCompleted += 1;
    } else {
      agent.totalTasksFailed += 1;
    }

    if (agent.activeTasksCount < agent.capabilities.maxConcurrency && agent.status === 'busy') {
      this.updateStatus(agentId, 'idle');
    }
  }
}
