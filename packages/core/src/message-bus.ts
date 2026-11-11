import { AgentMessage, MessageType } from '@coagent/protocol';
import { generateId, createLogger, Logger } from '@coagent/shared';
import { MessageRepository } from '@coagent/storage';
import { EventBus } from './event-bus.js';

export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

export class MessageBus {
  private readonly subscribers = new Map<string, Set<MessageHandler>>();
  private readonly logger: Logger;

  constructor(
    private readonly messageRepo?: MessageRepository,
    private readonly eventBus?: EventBus
  ) {
    this.logger = createLogger('core:message-bus');
  }

  public subscribe(agentOrTarget: string, handler: MessageHandler): () => void {
    if (!this.subscribers.has(agentOrTarget)) {
      this.subscribers.set(agentOrTarget, new Set());
    }
    this.subscribers.get(agentOrTarget)!.add(handler);

    return () => {
      this.subscribers.get(agentOrTarget)?.delete(handler);
    };
  }

  public async sendMessage<T = unknown>(params: {
    taskId: string;
    correlationId: string;
    source: string;
    target: string;
    type: MessageType;
    payload: T;
    contextRef?: string;
    requiresResponse?: boolean;
  }): Promise<AgentMessage<T>> {
    const message: AgentMessage<T> = {
      id: generateId('msg'),
      taskId: params.taskId,
      correlationId: params.correlationId,
      source: params.source,
      target: params.target,
      type: params.type,
      payload: params.payload,
      contextRef: params.contextRef,
      requiresResponse: params.requiresResponse ?? false,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    this.logger.debug(
      `Mensagem enviada: [${message.type}] ${message.source} -> ${message.target} (Task: ${message.taskId})`
    );

    // Persistência
    if (this.messageRepo) {
      this.messageRepo.save(message as AgentMessage);
    }

    // Event bus notification
    this.eventBus?.emitEvent(
      'message:sent',
      {
        messageId: message.id,
        type: message.type,
        source: message.source,
        target: message.target,
      },
      { taskId: message.taskId }
    );

    // Entrega aos inscritos diretos
    const directSubs = this.subscribers.get(message.target);
    const broadcastSubs = this.subscribers.get('*');
    const allHandlers = new Set([...(directSubs ?? []), ...(broadcastSubs ?? [])]);

    for (const handler of allHandlers) {
      try {
        await handler(message as AgentMessage);
      } catch (err) {
        this.logger.error(`Erro ao processar handler de mensagem ${message.id}`, err);
      }
    }

    message.status = 'delivered';
    if (this.messageRepo) {
      this.messageRepo.save(message as AgentMessage);
    }

    return message;
  }
}
