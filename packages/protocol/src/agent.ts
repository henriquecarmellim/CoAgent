import { z } from 'zod';
import { TaskTypeSchema } from './task.js';
import { PermissionLevelSchema } from './permission.js';

export const AgentProviderSchema = z.enum([
  'agy',
  'claude-code',
  'codex',
  'opencode',
  'custom',
]);

export type AgentProvider = z.infer<typeof AgentProviderSchema>;

export const AgentStatusSchema = z.enum([
  'idle',
  'busy',
  'offline',
  'error',
  'disabled',
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentCapabilitySchema = z.object({
  supportedTaskTypes: z.array(TaskTypeSchema),
  supportsStreaming: z.boolean().default(true),
  supportsSessions: z.boolean().default(true),
  supportsTools: z.boolean().default(true),
  supportsMcp: z.boolean().default(false),
  maxConcurrency: z.number().int().min(1).default(1),
  permissionLevels: z.array(PermissionLevelSchema).default(['read-only', 'workspace-write']),
  availableModels: z.array(z.string()).default([]),
});

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: AgentProviderSchema,
  version: z.string(),
  description: z.string().default(''),
  capabilities: AgentCapabilitySchema,
  status: AgentStatusSchema.default('idle'),
  currentTaskId: z.string().nullable().optional(),
  activeTasksCount: z.number().int().min(0).default(0),
  totalTasksCompleted: z.number().int().min(0).default(0),
  totalTasksFailed: z.number().int().min(0).default(0),
  lastActiveAt: z.string().optional(),
});

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;
