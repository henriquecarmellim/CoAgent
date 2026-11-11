import { Task } from '@coagent/protocol';
import { CoAgentError, createLogger, Logger, withTimeout } from '@coagent/shared';
import { TaskManager, AgentRegistry, EventBus } from '@coagent/core';
import { ConcurrencyController } from './concurrency-controller.js';
import { PriorityTaskQueue } from './priority-queue.js';
import { DagValidator } from './dag-validator.js';

export interface TaskExecutionHandler {
  (task: Task, signal: AbortSignal): Promise<unknown>;
}

export class TaskScheduler {
  private readonly queue = new PriorityTaskQueue();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly runningTasks = new Map<string, Task>();
  private readonly logger: Logger;
  private isProcessing = false;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly concurrency: ConcurrencyController,
    private readonly agentRegistry?: AgentRegistry,
    private readonly eventBus?: EventBus,
    private executionHandler?: TaskExecutionHandler
  ) {
    this.logger = createLogger('scheduler:task-scheduler');
  }

  public setExecutionHandler(handler: TaskExecutionHandler): void {
    this.executionHandler = handler;
  }

  public submitTask(task: Task): void {
    // Validar grafo de tarefas para evitar ciclos
    const allTasks = [...this.taskManager.listTasks(), task];
    DagValidator.validateNoCycles(allTasks);

    this.taskManager.transitionStatus(task.id, 'queued');
    this.queue.enqueue(task);
    this.logger.info(`Tarefa [${task.id}] enfileirada no agendador. Tamanho da fila: ${this.queue.size}`);

    this.processQueue();
  }

  public cancelRunningTask(taskId: string, reason = 'Cancelado pelo usuário'): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      this.logger.info(`Acionando AbortSignal para tarefa em execução [${taskId}]`);
      controller.abort(new CoAgentError('TASK_CANCELLED', reason));
      this.abortControllers.delete(taskId);
    }

    this.queue.remove(taskId);
    this.taskManager.cancelTask(taskId, reason);
  }

  public async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.size > 0) {
        const nextTask = this.queue.peek();
        if (!nextTask) break;

        // Verificar se dependências estão satisfeitas
        if (!this.taskManager.areDependenciesSatisfied(nextTask)) {
          this.logger.debug(`Tarefa [${nextTask.id}] aguarda dependências. Mantendo na fila.`);
          break;
        }

        const agentMetadata = nextTask.assignedAgent && this.agentRegistry
          ? this.agentRegistry.getAgent(nextTask.assignedAgent)
          : null;

        const provider = agentMetadata?.provider;

        if (!this.concurrency.canAcquire(provider)) {
          this.logger.debug(
            `Slots de concorrência ocupados (Ativos: ${this.concurrency.activeGlobal}/${this.concurrency.maxGlobal}). Aguardando liberação.`
          );
          break;
        }

        // Remove da fila e adquire slot
        this.queue.dequeue();
        const releaseSlot = await this.concurrency.acquire(provider);

        // Dispara execução assíncrona em background (sem bloquear o loop da fila)
        this.executeTask(nextTask, releaseSlot).catch((err) => {
          this.logger.error(`Erro inesperado ao despachar tarefa [${nextTask.id}]`, err);
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeTask(task: Task, releaseSlot: () => void): Promise<void> {
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);
    this.runningTasks.set(task.id, task);

    if (task.assignedAgent && this.agentRegistry) {
      this.agentRegistry.incrementActiveTasks(task.assignedAgent);
    }

    this.eventBus?.emitEvent('concurrency:slot_acquired', {
      taskId: task.id,
      agentId: task.assignedAgent,
      activeGlobal: this.concurrency.activeGlobal,
    });

    try {
      this.taskManager.transitionStatus(task.id, 'running', {
        startedAt: new Date().toISOString(),
      });

      if (!this.executionHandler) {
        throw new CoAgentError('CONFIG_ERROR', 'Nenhum TaskExecutionHandler registrado no scheduler');
      }

      this.logger.info(`Iniciando execução da tarefa [${task.id}] com timeout de ${task.timeoutMs}ms`);

      const executionPromise = this.executionHandler(task, abortController.signal);
      const result = await withTimeout(
        executionPromise,
        task.timeoutMs,
        `Tempo limite excedido na execução da tarefa ${task.id}`
      );

      this.taskManager.transitionStatus(task.id, 'completed', {
        result,
        completedAt: new Date().toISOString(),
      });

      this.logger.info(`Tarefa [${task.id}] finalizada com SUCESSO`);
      if (task.assignedAgent && this.agentRegistry) {
        this.agentRegistry.decrementActiveTasks(task.assignedAgent, true);
      }
    } catch (error) {
      const isCancelled = abortController.signal.aborted;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Falha na execução da tarefa [${task.id}]: ${errorMessage}`);

      if (task.assignedAgent && this.agentRegistry) {
        this.agentRegistry.decrementActiveTasks(task.assignedAgent, false);
      }

      if (!isCancelled) {
        // Tentar retry se permitido
        if (task.attemptCount < task.maxRetries) {
          const nextAttempt = task.attemptCount + 1;
          this.logger.warn(`Agendando retry ${nextAttempt}/${task.maxRetries} para a tarefa [${task.id}]`);

          this.taskManager.transitionStatus(task.id, 'queued', {
            attemptCount: nextAttempt,
            error: {
              code: error instanceof CoAgentError ? error.code : 'AGENT_EXECUTION_FAILED',
              message: errorMessage,
            },
          });

          this.queue.enqueue(this.taskManager.getTaskOrThrow(task.id));
        } else {
          this.taskManager.transitionStatus(task.id, 'failed', {
            error: {
              code: error instanceof CoAgentError ? error.code : 'AGENT_EXECUTION_FAILED',
              message: errorMessage,
            },
            completedAt: new Date().toISOString(),
          });
        }
      }
    } finally {
      this.abortControllers.delete(task.id);
      this.runningTasks.delete(task.id);
      releaseSlot();

      // Processar próximas tarefas na fila após liberação de slot
      this.processQueue();
    }
  }

  public get activeTasks(): Task[] {
    return Array.from(this.runningTasks.values());
  }

  public get queuedTasks(): Task[] {
    return this.queue.getAll();
  }
}
