import { z } from 'zod';

/**
 * Níveis de permissão de segurança do CoAgent.
 */
export const PermissionLevelSchema = z.enum([
  'read-only',             // Apenas leitura de arquivos e análise, sem escrita ou execução no terminal
  'workspace-write',       // Modificação restrita de arquivos dentro da workspace do projeto
  'danger-full-access',    // Acesso completo ao terminal e ferramentas (requer aprovação explícita)
]);

export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

/**
 * Política de segurança aplicada a um agente ou tarefa.
 */
export const SecurityPolicySchema = z.object({
  level: PermissionLevelSchema.default('workspace-write'),
  allowedDirectories: z.array(z.string()).default([]),
  blockedCommands: z.array(z.string()).default([
    'rm -rf /',
    'rmdir /s /q c:\\',
    'format',
    'mkfs',
    'dd',
    'shutdown',
  ]),
  allowTerminalExecution: z.boolean().default(true),
  requireApprovalForDestructive: z.boolean().default(true),
});

export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;
