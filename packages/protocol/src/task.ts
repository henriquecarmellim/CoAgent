import { z } from 'zod';
import { SecurityPolicySchema } from './permission.js';

export const TaskStatusSchema = z.enum([
  'pending',
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
  'blocked',
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskTypeSchema = z.enum([
  'research',
  'architecture',
  'implementation',
  'code_review',
  'refactoring',
  'testing',
  'debugging',
  'documentation',
  'audit',
  'general',
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

/**
 * Matriz de transições de estado válidas para integridade do ciclo de vida.
 */
export const VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['queued', 'running', 'cancelled', 'blocked'],
  queued: ['running', 'cancelled', 'blocked'],
  running: ['waiting_approval', 'completed', 'failed', 'cancelled', 'blocked'],
  waiting_approval: ['running', 'cancelled', 'failed'],
  blocked: ['queued', 'pending', 'cancelled', 'failed'],
  completed: [],
  failed: ['queued', 'running'], // Permite retry
  cancelled: [],
};

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) {
    return true; // Idempotência / atualização de campos mantendo mesmo estado
  }
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export const TaskDefinitionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'O título da tarefa é obrigatório'),
  description: z.string().default(''),
  type: TaskTypeSchema.default('general'),
  priority: TaskPrioritySchema.default('normal'),
  assignedAgent: z.string().optional(),
  targetModel: z.string().optional(),
  parentTaskId: z.string().optional(),
  dependsOn: z.array(z.string()).default([]),
  timeoutMs: z.number().positive().default(300_000), // 5 minutos padrão
  maxRetries: z.number().int().min(0).default(2),
  securityPolicy: SecurityPolicySchema.optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;
export type TaskDefinitionInput = z.input<typeof TaskDefinitionSchema>;

export const TaskSchema = TaskDefinitionSchema.extend({
  id: z.string(),
  status: TaskStatusSchema.default('pending'),
  assignedAgent: z.string().nullable().optional(),
  attemptCount: z.number().int().min(0).default(0),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
  approvalRequiredReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
