import { Task } from '@coagent/protocol';
import { CoAgentError } from '@coagent/shared';

/**
 * Validador de Grafo Acíclico Dirigido (DAG) para dependências de tarefas.
 * Impede loops de dependência e deadlocks estruturais.
 */
export class DagValidator {
  /**
   * Verifica se a adição de uma dependência cria um ciclo no grafo de tarefas.
   * Utiliza algoritmo de coloração de nós / busca em profundidade (DFS).
   * Branco = não visitado (0), Cinza = visitando (1), Preto = concluído (2).
   */
  public static validateNoCycles(tasks: Task[]): void {
    const adjList = new Map<string, string[]>();
    for (const t of tasks) {
      adjList.set(t.id, t.dependsOn ?? []);
    }

    const state = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited

    function hasCycle(taskId: string, path: string[]): boolean {
      state.set(taskId, 1);
      path.push(taskId);

      const neighbors = adjList.get(taskId) ?? [];
      for (const neighbor of neighbors) {
        const neighborState = state.get(neighbor) ?? 0;
        if (neighborState === 1) {
          // Ciclo detectado!
          path.push(neighbor);
          return true;
        }
        if (neighborState === 0) {
          if (hasCycle(neighbor, path)) {
            return true;
          }
        }
      }

      path.pop();
      state.set(taskId, 2);
      return false;
    }

    for (const task of tasks) {
      if ((state.get(task.id) ?? 0) === 0) {
        const path: string[] = [];
        if (hasCycle(task.id, path)) {
          throw new CoAgentError(
            'TASK_DEPENDENCY_CYCLE',
            `Ciclo de dependência detectado entre tarefas: ${path.join(' -> ')}`
          );
        }
      }
    }
  }
}
