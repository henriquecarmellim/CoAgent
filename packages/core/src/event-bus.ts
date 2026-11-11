import { EventEmitter } from 'node:events';
import { SystemEvent, SystemEventType } from '@coagent/protocol';
import { createLogger, generateId, Logger } from '@coagent/shared';

export type SystemEventListener = (event: SystemEvent) => void | Promise<void>;

export class EventBus {
  private readonly emitter: EventEmitter;
  private readonly logger: Logger;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.logger = createLogger('core:event-bus');
  }

  public emitEvent(
    type: SystemEventType,
    payload: Record<string, unknown> = {},
    options?: { taskId?: string; agentId?: string }
  ): SystemEvent {
    const event: SystemEvent = {
      id: generateId('evt'),
      type,
      timestamp: new Date().toISOString(),
      taskId: options?.taskId,
      agentId: options?.agentId,
      payload,
    };

    this.logger.debug(`Evento emitido: ${type}`, { eventId: event.id, taskId: options?.taskId });
    this.emitter.emit(type, event);
    this.emitter.emit('*', event);

    return event;
  }

  public on(type: SystemEventType | '*', listener: SystemEventListener): () => void {
    this.emitter.on(type, listener);
    return () => {
      this.emitter.off(type, listener);
    };
  }

  public once(type: SystemEventType, listener: SystemEventListener): void {
    this.emitter.once(type, listener);
  }
}
