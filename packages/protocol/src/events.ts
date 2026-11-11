import { z } from 'zod';
import { TaskStatus } from './task.js';
import { AgentStatus } from './agent.js';

export const SystemEventTypeSchema = z.enum([
  'task:created',
  'task:queued',
  'task:started',
  'task:progress',
  'task:waiting_approval',
  'task:approved',
  'task:rejected',
  'task:completed',
  'task:failed',
  'task:cancelled',
  'task:blocked',
  'agent:registered',
  'agent:status_changed',
  'agent:error',
  'message:sent',
  'message:received',
  'concurrency:slot_acquired',
  'concurrency:slot_released',
  'security:violation_attempt',
]);

export type SystemEventType = z.infer<typeof SystemEventTypeSchema>;

export const SystemEventSchema = z.object({
  id: z.string(),
  type: SystemEventTypeSchema,
  timestamp: z.string(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

export type SystemEvent = z.infer<typeof SystemEventSchema>;

export interface TaskStateChangedEventData {
  taskId: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  assignedAgent?: string | null;
  error?: string;
}

export interface AgentStatusChangedEventData {
  agentId: string;
  previousStatus: AgentStatus;
  newStatus: AgentStatus;
}
