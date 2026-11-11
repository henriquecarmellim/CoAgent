import { Task } from '@coagent/protocol';
import {
  TaskManager,
  AgentRegistry,
  ContextManager,
  MessageBus,
  PermissionManager,
  EventBus,
  ProjectMemoryManager,
  WorktreeManager,
} from '@coagent/core';
import { TaskScheduler } from '@coagent/scheduler';
import { AgentAdapter } from '@coagent/adapters';
import { CoAgentError, createLogger, Logger, sleep } from '@coagent/shared';
import { SmartDelegator } from './smart-delegator.js';
import { PlanDecomposer, ExecutionPlan } from './plan-decomposer.js';
import { ResultAggregator, ConsolidatedResult } from './result-aggregator.js';
import { AdvisorEngine, AdvisorCritique } from './advisor-engine.js';
import { SelfHealingController } from './self-healing.js';

export interface CoAgentOrchestratorConfig {
  maxGlobalParallelism?: number;
  workingDirectory?: string;
  enableWorktrees?: boolean;
  enableSelfHealing?: boolean;
  dangerouslySkipPermissions?: boolean;
}

export class CoAgentOrchestrator {
  private readonly adapters = new Map<string, AgentAdapter>();
  public readonly smartDelegator: SmartDelegator;
  public readonly planDecomposer: PlanDecomposer;
  public readonly resultAggregator: ResultAggregator;
  public readonly advisor: AdvisorEngine;
  public readonly projectMemory: ProjectMemoryManager;
  public readonly worktreeManager: WorktreeManager;
  public readonly selfHealing: SelfHealingController;
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
    this.advisor = new AdvisorEngine(agentRegistry, messageBus);
    this.projectMemory = new ProjectMemoryManager(config.workingDirectory);
    this.worktreeManager = new WorktreeManager(config.workingDirectory);
    this.selfHealing = new SelfHealingController();
    this.logger = createLogger('orchestrator:engine');

    if (config.dangerouslySkipPermissions) {
      this.permissionManager.setDangerouslySkipPermissions(true);
    }

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
   * Executa um objetivo completo de alto nível com consultoria do Advisor e auto-cura.
   */
  public async executeObjective(
    goal: string,
    options?: {
      onProgress?: (completed: number, total: number) => void;
      onAdvisorCritique?: (critique: AdvisorCritique) => void;
    }
  ): Promise<ConsolidatedResult> {
    this.logger.info(`Recebido objetivo para orquestração: "${goal}"`);

    // 1. Decomposição do Objetivo
    const plan: ExecutionPlan = this.planDecomposer.decomposeObjective(goal);

    // 2. Advisor Critique (Segundo par de olhos antes de iniciar)
    const critique = this.advisor.critiquePlan(plan);
    this.logger.info(`Parecer do Advisor sobre o plano: ${critique.summary}`);
    if (options?.onAdvisorCritique) {
      options.onAdvisorCritique(critique);
    }

    // 3. Criação da Tarefa Macro
    const mainTaskId = this.taskManager.createTask({
      title: `[Orquestração] ${goal}`,
      type: 'general',
      priority: 'high',
      metadata: { isMainObjective: true, planId: plan.id, advisorScore: critique.score },
    }).id;
    this.taskManager.transitionStatus(mainTaskId, 'running');

    // 4. Criação e atribuição das subtarefas com SmartDelegator
    const subtaskDefs = this.planDecomposer.toTaskDefinitions(plan, mainTaskId);
    const createdTasks: Task[] = [];
    let implementationAgentId: string | undefined;

    for (const def of subtaskDefs) {
      const task = this.taskManager.createTask(def);
      const excludeAgentId = def.type === 'code_review' ? implementationAgentId : undefined;
      const assigned = this.smartDelegator.selectBestAgent(task, { excludeAgentId });

      task.assignedAgent = assigned.id;
      this.taskManager.transitionStatus(task.id, 'pending', { assignedAgent: assigned.id });

      if (def.type === 'implementation') {
        implementationAgentId = assigned.id;
      }

      createdTasks.push(task);
    }

    // 5. Submissão das tarefas ao scheduler paralelo
    for (const task of createdTasks) {
      this.scheduler.submitTask(task);
    }

    // 6. Monitoramento de execução e suporte a Self-Healing Loop
    const pendingIds = new Set(createdTasks.map((t) => t.id));
    while (pendingIds.size > 0) {
      await sleep(100);

      for (const id of Array.from(pendingIds)) {
        const current = this.taskManager.getTask(id);
        if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
          pendingIds.delete(id);

          // Self-Healing Loop automático em caso de falha
          if (current.status === 'failed' && this.config.enableSelfHealing !== false) {
            const diagnosis = this.selfHealing.diagnoseAndHeal(current);
            if (diagnosis) {
              this.logger.warn(`Acionando auto-cura para subtarefa [${current.id}]...`);
              const healingTask = this.taskManager.createTask(diagnosis.healingTaskDefinition);
              createdTasks.push(healingTask);
              pendingIds.add(healingTask.id);
              this.scheduler.submitTask(healingTask);
            }
          }

          if (options?.onProgress) {
            options.onProgress(createdTasks.length - pendingIds.size, createdTasks.length);
          }
        }
      }
    }

    // 7. Consolidação Final
    const finalTasks = createdTasks.map((t) => this.taskManager.getTaskOrThrow(t.id));
    const consolidated = this.resultAggregator.aggregate(goal, finalTasks);

    this.taskManager.transitionStatus(
      mainTaskId,
      consolidated.success ? 'completed' : 'failed',
      { result: consolidated }
    );

    return consolidated;
  }

  /**
   * Despacha uma tarefa individual com isolamento de worktree e contexto do COAGENT.md.
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

    // Verificação de permissões
    this.permissionManager.assertAllowed(
      { taskId: task.id, agentId: task.assignedAgent },
      task.securityPolicy
    );

    // Isolamento opcional de Git Worktree para tarefas que alteram código
    const shouldIsolateWorktree =
      this.config.enableWorktrees !== false &&
      ['implementation', 'refactoring', 'debugging'].includes(task.type);

    let worktreeSession = shouldIsolateWorktree ? this.worktreeManager.createWorktree(task.id) : null;
    const effectiveWorkingDir = worktreeSession?.worktreePath ?? (this.config.workingDirectory ?? process.cwd());

    // Injeção de memória do projeto (COAGENT.md)
    const originalDescription = task.description;
    task.description = this.projectMemory.formatPromptContext(originalDescription);

    try {
      // Comunicação via MessageBus
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
          worktreePath: worktreeSession?.worktreePath,
        },
      });

      // Execução física no processo do agente
      const isDangerBypass =
        Boolean(this.config.dangerouslySkipPermissions) ||
        Boolean(task.securityPolicy?.dangerouslySkipPermissions);

      const result = await adapter.execute({
        task,
        signal,
        workingDirectory: effectiveWorkingDir,
        dangerouslySkipPermissions: isDangerBypass,
        onChunk: (chunk) => {
          this.eventBus.emitEvent(
            'task:progress',
            { chunk },
            { taskId: task.id, agentId: task.assignedAgent! }
          );
        },
      });

      // Se utilizou worktree isolada, faz merge seguro de volta
      if (worktreeSession) {
        this.worktreeManager.mergeWorktree(worktreeSession);
      }

      await this.messageBus.sendMessage({
        taskId: task.id,
        correlationId: (task.metadata['planId'] as string) ?? task.id,
        source: task.assignedAgent,
        target: 'orchestrator',
        type: 'TASK_COMPLETE',
        payload: result,
      });

      return result.rawJson ?? result.output;
    } finally {
      task.description = originalDescription; // Restaura descrição original
      if (worktreeSession) {
        this.worktreeManager.removeWorktree(task.id);
      }
    }
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
      projectMemory: {
        loaded: Boolean(this.projectMemory.getLoadedPath()),
        path: this.projectMemory.getLoadedPath(),
      },
    };
  }
}
