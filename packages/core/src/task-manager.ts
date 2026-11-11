import {
  Task,
  TaskDefinitionInput,
  TaskStatus,
  isValidStatusTransition,
  SecurityPolicySchema,
} from '@coagent/protocol';
import { CoAgentError, createLogger, generateId, Logger } from '@coagent/shared';
import { TaskRepository } from '@coagent/storage';
import { EventBus } from './event-bus.js';

export class TaskManager {
  private readonly logger: Logger;

  constructor(
    private readonly repository: TaskRepository,
    private readonly eventBus?: EventBus
  ) {
    this.logger = createLogger('core:task-manager');
  }

  public createTask(definition: TaskDefinitionInput): Task {
    const now = new Date().toISOString();
    const id = definition.id ?? generateId('task');

    const task: Task = {
      ...definition,
      id,
      title: definition.title,
      type: definition.type ?? 'general',
      priority: definition.priority ?? 'normal',
      description: definition.description ?? '',
      timeoutMs: definition.timeoutMs ?? 300_000,
      maxRetries: definition.maxRetries ?? 2,
      dependsOn: definition.dependsOn ?? [],
      securityPolicy: definition.securityPolicy
        ? SecurityPolicySchema.parse(definition.securityPolicy)
        : undefined,
      metadata: definition.metadata ?? {},
      status: 'pending',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.repository.save(task);
    this.logger.info(`Tarefa criada: [${task.id}] "${task.title}" (Prioridade: ${task.priority})`);

    this.eventBus?.emitEvent(
      'task:created',
      { title: task.title, type: task.type, priority: task.priority },
      { taskId: task.id }
    );

    return task;
  }

  public getTask(id: string): Task | null {
    return this.repository.findById(id);
  }

  public getTaskOrThrow(id: string): Task {
    const task = this.getTask(id);
    if (!task) {
      throw new CoAgentError('TASK_NOT_FOUND', `Tarefa com ID '${id}' não encontrada.`);
    }
    return task;
  }

  public listTasks(limit = 100): Task[] {
    return this.repository.listAll(limit);
  }

  public getTasksByStatus(status: TaskStatus): Task[] {
    return this.repository.findByStatus(status);
  }

  public transitionStatus(
    taskId: string,
    newStatus: TaskStatus,
    updates?: Partial<Omit<Task, 'id' | 'status' | 'createdAt'>>
  ): Task {
    const currentTask = this.getTaskOrThrow(taskId);
    const prevStatus = currentTask.status;

    if (!isValidStatusTransition(prevStatus, newStatus)) {
      throw new CoAgentError(
        'TASK_INVALID_STATE_TRANSITION',
        `Transição de estado inválida para a tarefa ${taskId}: '${prevStatus}' -> '${newStatus}'.`
      );
    }

    this.repository.updateStatus(taskId, newStatus, updates);
    const updatedTask = this.getTaskOrThrow(taskId);

    this.logger.debug(`Transição de tarefa [${taskId}]: ${prevStatus} -> ${newStatus}`);

    const eventTypeMap: Partial<Record<TaskStatus, Parameters<EventBus['emitEvent']>[0]>> = {
      queued: 'task:queued',
      running: 'task:started',
      waiting_approval: 'task:waiting_approval',
      completed: 'task:completed',
      failed: 'task:failed',
      cancelled: 'task:cancelled',
      blocked: 'task:blocked',
    };

    const mappedEvent = eventTypeMap[newStatus];
    if (mappedEvent) {
      this.eventBus?.emitEvent(
        mappedEvent,
        {
          previousStatus: prevStatus,
          newStatus,
          assignedAgent: updatedTask.assignedAgent,
          error: updatedTask.error,
        },
        { taskId }
      );
    }

    return updatedTask;
  }

  public cancelTask(taskId: string, reason = 'Cancelamento solicitado pelo usuário'): Task {
    const task = this.getTaskOrThrow(taskId);

    if (['completed', 'cancelled', 'failed'].includes(task.status)) {
      this.logger.warn(`Tentativa de cancelar tarefa [${taskId}] que já está no estado '${task.status}'`);
      return task;
    }

    return this.transitionStatus(taskId, 'cancelled', {
      error: {
        code: 'TASK_CANCELLED',
        message: reason,
      },
    });
  }

  public areDependenciesSatisfied(task: Task): boolean {
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }

    for (const depId of task.dependsOn) {
      const depTask = this.getTask(depId);
      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }

    return true;
  }
}
