import { Task } from '@coagent/protocol';
import {
  TaskManager,
  AgentRegistry,
  ContextManager,
  MessageBus,
  PermissionManager,
  EventBus,
} from '@coagent/core';
import { TaskScheduler } from '@coagent/scheduler';
import { AgentAdapter } from '@coagent/adapters';
import { CoAgentError, createLogger, Logger, sleep } from '@coagent/shared';
import { SmartDelegator } from './smart-delegator.js';
import { PlanDecomposer, ExecutionPlan } from './plan-decomposer.js';
import { ResultAggregator, ConsolidatedResult } from './result-aggregator.js';

export interface CoAgentOrchestratorConfig {
  maxGlobalParallelism?: number;
  workingDirectory?: string;
}

export class CoAgentOrchestrator {
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly smartDelegator: SmartDelegator;
  private readonly planDecomposer: PlanDecomposer;
  private readonly resultAggregator: ResultAggregator;
  private readonly logger: Logger;

  constructor(
    public readonly taskManager: TaskManager,
    public readonly scheduler: TaskScheduler,
    public readonly agentRegistry: AgentRegistry,
    public readonly contextManager: ContextManager,
    public readonly messageBus: MessageBus,
    public readonly permissionManager: PermissionManager,
    public readonly eventBus: EventBus,
    private readonly config: CoAgentOrchestratorConfig = {}
  ) {
    this.smartDelegator = new SmartDelegator(agentRegistry);
    this.planDecomposer = new PlanDecomposer();
    this.resultAggregator = new ResultAggregator();
    this.logger = createLogger('orchestrator:engine');

    // Conecta o handler de execução do scheduler aos adaptadores de agentes
    this.scheduler.setExecutionHandler(async (task, signal) => {
      return this.dispatchTaskToAdapter(task, signal);
    });
  }

  public registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter);
    this.agentRegistry.register(adapter.getMetadata());
    this.logger.info(`Adaptador de agente registrado: [${adapter.id}] (${adapter.provider})`);
  }

  public getAdapter(agentId: string): AgentAdapter | null {
    return this.adapters.get(agentId) ?? null;
  }

  /**
   * Executa um objetivo completo de alto nível:
   * 1. Decompõe o objetivo em um plano de subtarefas DAG.
   * 2. Atribui cada subtarefa ao melhor agente (com regra de isolamento para revisão).
   * 3. Submete as tarefas ao scheduler de concorrência.
   * 4. Acompanha até conclusão e consolida o resultado final.
   */
  public async executeObjective(
    goal: string,
    options?: { onProgress?: (completed: number, total: number) => void }
  ): Promise<ConsolidatedResult> {
    this.logger.info(`Recebido objetivo para orquestração: "${goal}"`);

    // 1. Decomposição
    const plan: ExecutionPlan = this.planDecomposer.decomposeObjective(goal);
    const mainTaskId = this.taskManager.createTask({
      title: `[Orquestração] ${goal}`,
      type: 'general',
      priority: 'high',
      metadata: { isMainObjective: true, planId: plan.id },
    }).id;
    this.taskManager.transitionStatus(mainTaskId, 'running');

    // 2. Criação das subtarefas
    const subtaskDefs = this.planDecomposer.toTaskDefinitions(plan, mainTaskId);
    const createdTasks: Task[] = [];

    // Mapeamento de agente autor para garantir revisor independente
    let implementationAgentId: string | undefined;

    for (const def of subtaskDefs) {
      // Cria a tarefa no TaskManager
      const task = this.taskManager.createTask(def);

      // Delegação Inteligente
      const excludeAgentId = def.type === 'code_review' ? implementationAgentId : undefined;
      const assigned = this.smartDelegator.selectBestAgent(task, { excludeAgentId });

      task.assignedAgent = assigned.id;
      this.taskManager.transitionStatus(task.id, 'pending', { assignedAgent: assigned.id });

      if (def.type === 'implementation') {
        implementationAgentId = assigned.id;
      }

      createdTasks.push(task);
    }

    // 3. Submissão das tarefas ao scheduler
    for (const task of createdTasks) {
      this.scheduler.submitTask(task);
    }

    // 4. Aguarda conclusão de todas as subtarefas
    const pendingIds = new Set(createdTasks.map((t) => t.id));
    while (pendingIds.size > 0) {
      await sleep(100);

      for (const id of Array.from(pendingIds)) {
        const current = this.taskManager.getTask(id);
        if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
          pendingIds.delete(id);
          if (options?.onProgress) {
            options.onProgress(createdTasks.length - pendingIds.size, createdTasks.length);
          }
        }
      }
    }

    // 5. Agregação dos resultados
    const finalTasks = createdTasks.map((t) => this.taskManager.getTaskOrThrow(t.id));
    const consolidated = this.resultAggregator.aggregate(goal, finalTasks);

    // Atualiza status da tarefa principal
    this.taskManager.transitionStatus(
      mainTaskId,
      consolidated.success ? 'completed' : 'failed',
      { result: consolidated }
    );

    return consolidated;
  }

  /**
   * Despacha uma tarefa individual para o adaptador do agente correspondente.
   */
  private async dispatchTaskToAdapter(task: Task, signal: AbortSignal): Promise<unknown> {
    if (!task.assignedAgent) {
      const best = this.smartDelegator.selectBestAgent(task);
      task.assignedAgent = best.id;
      this.taskManager.transitionStatus(task.id, 'running', { assignedAgent: best.id });
    }

    const adapter = this.getAdapter(task.assignedAgent);
    if (!adapter) {
      throw new CoAgentError(
        'AGENT_NOT_FOUND',
        `Adaptador para o agente '${task.assignedAgent}' não está registrado no orquestrador`
      );
    }

    // Verificação de permissões de segurança antes da execução
    this.permissionManager.assertAllowed(
      {
        taskId: task.id,
        agentId: task.assignedAgent,
      },
      task.securityPolicy
    );

    // Comunicação inicial via MessageBus
    await this.messageBus.sendMessage({
      taskId: task.id,
      correlationId: (task.metadata['planId'] as string) ?? task.id,
      source: 'orchestrator',
      target: task.assignedAgent,
      type: 'TASK_ASSIGN',
      payload: {
        title: task.title,
        description: task.description,
        type: task.type,
      },
    });

    // Execução física no adaptador CLI
    const result = await adapter.execute({
      task,
      signal,
      workingDirectory: this.config.workingDirectory ?? process.cwd(),
      onChunk: (chunk) => {
        this.eventBus.emitEvent(
          'task:progress',
          { chunk },
          { taskId: task.id, agentId: task.assignedAgent! }
        );
      },
    });

    // Comunicação de entrega final
    await this.messageBus.sendMessage({
      taskId: task.id,
      correlationId: (task.metadata['planId'] as string) ?? task.id,
      source: task.assignedAgent,
      target: 'orchestrator',
      type: 'TASK_COMPLETE',
      payload: result,
    });

    return result.rawJson ?? result.output;
  }

  public getSystemStatus() {
    return {
      agents: this.agentRegistry.listAgents(),
      activeTasks: this.scheduler.activeTasks,
      queuedTasks: this.scheduler.queuedTasks,
      concurrency: {
        active: this.scheduler.activeTasks.length,
        max: 4,
      },
    };
  }
}
