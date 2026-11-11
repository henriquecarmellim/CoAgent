import { z } from 'zod';

export const MessageTypeSchema = z.enum([
  'TASK_ASSIGN',        // Orquestrador atribui tarefa a um agente
  'TASK_START',         // Agente confirma início de execução
  'STATUS_UPDATE',      // Agente envia progresso/status
  'NEED_INFO',          // Agente solicita esclarecimento ou dado extra
  'INFO_REPLY',         // Resposta a solicitação de informação
  'REQUEST_REVIEW',     // Agente solicita revisão de código para outro agente
  'REVIEW_RESULT',      // Agente revisor devolve parecer de revisão
  'REQUEST_APPROVAL',   // Agente solicita autorização para ação destrutiva
  'APPROVAL_DECISION',  // Decisão humana/orquestrador (aprovado/rejeitado)
  'TASK_COMPLETE',      // Agente entrega o resultado final da tarefa
  'TASK_ERROR',         // Agente reporta falha de execução
  'BROADCAST_NOTICE',   // Mensagem global para todos os agentes
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageStatusSchema = z.enum(['pending', 'delivered', 'processed', 'failed']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  correlationId: z.string(),
  source: z.string(),
  target: z.string(),
  type: MessageTypeSchema,
  payload: z.unknown(),
  contextRef: z.string().optional(),
  requiresResponse: z.boolean().default(false),
  timestamp: z.string(),
  status: MessageStatusSchema.default('pending'),
});

export type AgentMessage<T = unknown> = Omit<z.infer<typeof AgentMessageSchema>, 'payload'> & {
  payload: T;
};
