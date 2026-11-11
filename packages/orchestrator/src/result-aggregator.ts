import { Task } from '@coagent/protocol';
import { createLogger, Logger } from '@coagent/shared';

export interface ConsolidatedResult {
  goal: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  success: boolean;
  durationMs: number;
  taskOutputs: Array<{
    taskId: string;
    title: string;
    agentId?: string | null;
    status: string;
    output?: unknown;
    error?: unknown;
  }>;
  summary: string;
}

export class ResultAggregator {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger('orchestrator:result-aggregator');
  }

  public aggregate(goal: string, tasks: Task[]): ConsolidatedResult {
    this.logger.info(`Consolidando resultados para o objetivo: "${goal}" (${tasks.length} tarefas)`);

    let completedCount = 0;
    let failedCount = 0;
    let minStartTime = Infinity;
    let maxEndTime = -Infinity;

    const taskOutputs = tasks.map((task) => {
      if (task.status === 'completed') completedCount++;
      if (task.status === 'failed') failedCount++;

      if (task.startedAt) {
        minStartTime = Math.min(minStartTime, new Date(task.startedAt).getTime());
      }
      if (task.completedAt) {
        maxEndTime = Math.max(maxEndTime, new Date(task.completedAt).getTime());
      }

      return {
        taskId: task.id,
        title: task.title,
        agentId: task.assignedAgent,
        status: task.status,
        output: task.result,
        error: task.error,
      };
    });

    const success = failedCount === 0 && completedCount === tasks.length;
    const durationMs =
      minStartTime !== Infinity && maxEndTime !== -Infinity ? Math.max(0, maxEndTime - minStartTime) : 0;

    const summary = success
      ? `Objetivo executado com 100% de sucesso. Todas as ${tasks.length} subtarefas foram concluídas e validadas.`
      : `Execução concluída com ressalvas: ${completedCount}/${tasks.length} tarefas com sucesso e ${failedCount} com falhas.`;

    return {
      goal,
      totalTasks: tasks.length,
      completedTasks: completedCount,
      failedTasks: failedCount,
      success,
      durationMs,
      taskOutputs,
      summary,
    };
  }
}
