import { Task, TaskType, AgentMetadata } from '@coagent/protocol';
import { AgentRegistry } from '@coagent/core';
import { createLogger, Logger, CoAgentError } from '@coagent/shared';

export interface AgentScoringOptions {
  excludeAgentId?: string; // Usado para revisão independente (revisor diferente do autor)
  preferredAgentId?: string;
}

export class SmartDelegator {
  private readonly logger: Logger;

  constructor(private readonly agentRegistry: AgentRegistry) {
    this.logger = createLogger('orchestrator:smart-delegator');
  }

  /**
   * Avalia e seleciona o agente mais apto para executar uma tarefa.
   */
  public selectBestAgent(task: Task, options?: AgentScoringOptions): AgentMetadata {
    // 1. Se um agente específico foi explicitamente definido na tarefa
    if (task.assignedAgent) {
      const explicitAgent = this.agentRegistry.getAgent(task.assignedAgent);
      if (explicitAgent) {
        return explicitAgent;
      }
      this.logger.warn(`Agente explicitamente solicitado '${task.assignedAgent}' não encontrado. Iniciando seleção automática.`);
    }

    // 2. Se houver preferência externa (e o agente existir)
    if (options?.preferredAgentId) {
      const preferred = this.agentRegistry.getAgent(options.preferredAgentId);
      if (preferred && preferred.status !== 'offline' && preferred.id !== options.excludeAgentId) {
        return preferred;
      }
    }

    // 3. Busca todos os agentes cadastrados
    const candidates = this.agentRegistry.listAgents().filter((a) => {
      if (options?.excludeAgentId && a.id === options.excludeAgentId) {
        return false;
      }
      return a.status !== 'offline' && a.status !== 'disabled';
    });

    if (candidates.length === 0) {
      throw new CoAgentError('AGENT_UNAVAILABLE', 'Nenhum agente ativo disponível no sistema para execução.');
    }

    // 4. Calcula pontuação para cada candidato
    let bestAgent: AgentMetadata | null = null;
    let highestScore = -Infinity;

    for (const candidate of candidates) {
      const score = this.calculateScore(candidate, task.type);
      this.logger.debug(`Score para agente [${candidate.id}] na tarefa de tipo '${task.type}': ${score}`);

      if (score > highestScore) {
        highestScore = score;
        bestAgent = candidate;
      }
    }

    if (!bestAgent || highestScore < 0) {
      // Fallback: pega o primeiro candidato com menor carga
      bestAgent = candidates.sort((a, b) => a.activeTasksCount - b.activeTasksCount)[0]!;
    }

    this.logger.info(`Agente selecionado para a tarefa [${task.id}]: ${bestAgent.name} (Score: ${highestScore})`);
    return bestAgent;
  }

  private calculateScore(agent: AgentMetadata, taskType: TaskType): number {
    let score = 0;

    // A: Compatibilidade de tipo de tarefa (peso +50)
    if (agent.capabilities.supportedTaskTypes.includes(taskType)) {
      score += 50;
    } else {
      score -= 30;
    }

    // B: Especialidades naturais recomendadas
    const affinityMap: Record<TaskType, string[]> = {
      research: ['agy', 'claude-code'],
      architecture: ['agy', 'claude-code'],
      documentation: ['agy', 'opencode'],
      implementation: ['claude-code', 'codex', 'opencode'],
      refactoring: ['claude-code', 'codex'],
      debugging: ['codex', 'claude-code'],
      testing: ['codex', 'claude-code'],
      code_review: ['codex', 'agy', 'claude-code'],
      audit: ['opencode', 'agy'],
      general: ['claude-code', 'agy', 'codex', 'opencode'],
    };

    const preferredProviders = affinityMap[taskType] ?? [];
    if (preferredProviders.includes(agent.provider)) {
      score += 25;
    }

    // C: Disponibilidade de capacidade (peso +20 se idle, penalidade por concorrência)
    if (agent.status === 'idle') {
      score += 20;
    } else if (agent.status === 'busy') {
      score -= 15;
    }

    // D: Carga atual (penalidade proporcional de -10 por tarefa ativa)
    score -= agent.activeTasksCount * 10;

    // E: Histórico de sucesso (peso +1 por tarefa completada até máx +10)
    score += Math.min(10, agent.totalTasksCompleted);

    return score;
  }
}
