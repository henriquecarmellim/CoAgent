import { Task, TaskPriority } from '@coagent/protocol';

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export class PriorityTaskQueue {
  private queue: Task[] = [];

  public enqueue(task: Task): void {
    // Insere mantendo a ordenação por peso decrescente e timestamp crescente
    const weight = PRIORITY_WEIGHTS[task.priority];

    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const current = this.queue[i];
      if (!current) continue;

      const currentWeight = PRIORITY_WEIGHTS[current.priority];
      if (weight > currentWeight) {
        insertIndex = i;
        break;
      } else if (weight === currentWeight) {
        if (new Date(task.createdAt).getTime() < new Date(current.createdAt).getTime()) {
          insertIndex = i;
          break;
        }
      }
    }

    this.queue.splice(insertIndex, 0, task);
  }

  public dequeue(): Task | undefined {
    return this.queue.shift();
  }

  public peek(): Task | undefined {
    return this.queue[0];
  }

  public remove(taskId: string): boolean {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  public get size(): number {
    return this.queue.length;
  }

  public getAll(): Task[] {
    return [...this.queue];
  }
}
