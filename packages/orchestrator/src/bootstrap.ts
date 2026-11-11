import { homedir } from 'node:os';
import { join } from 'node:path';
import { SQLiteDatabase, TaskRepository, MessageRepository, SessionRepository } from '@coagent/storage';
import {
  TaskManager,
  AgentRegistry,
  ContextManager,
  MessageBus,
  PermissionManager,
  EventBus,
} from '@coagent/core';
import { ConcurrencyController, TaskScheduler } from '@coagent/scheduler';
import {
  AgyAdapter,
  ClaudeCodeAdapter,
  CodexAdapter,
  OpenCodeAdapter,
} from '@coagent/adapters';
import { CoAgentOrchestrator } from './orchestrator.js';

export interface BootstrapOptions {
  dbPath?: string;
  maxGlobalParallelism?: number;
  workingDirectory?: string;
  dangerouslySkipPermissions?: boolean;
  enableWorktrees?: boolean;
  enableSelfHealing?: boolean;
}

export interface CoAgentInstance {
  db: SQLiteDatabase;
  taskManager: TaskManager;
  scheduler: TaskScheduler;
  agentRegistry: AgentRegistry;
  contextManager: ContextManager;
  messageBus: MessageBus;
  permissionManager: PermissionManager;
  eventBus: EventBus;
  orchestrator: CoAgentOrchestrator;
}

export function bootstrapCoAgent(options?: BootstrapOptions): CoAgentInstance {
  const dbPath = options?.dbPath ?? join(homedir(), '.coagent', 'coagent.db');
  const db = new SQLiteDatabase({ filename: dbPath });
  db.connect();

  const rawDb = db.getRawDb();
  const taskRepo = new TaskRepository(rawDb);
  const messageRepo = new MessageRepository(rawDb);
  const sessionRepo = new SessionRepository(rawDb);
  void sessionRepo; // Reservado para persistência de sessões de longo prazo

  const eventBus = new EventBus();
  const taskManager = new TaskManager(taskRepo, eventBus);
  const agentRegistry = new AgentRegistry(eventBus);
  const permissionManager = new PermissionManager();
  const contextManager = new ContextManager();
  const messageBus = new MessageBus(messageRepo, eventBus);

  const concurrency = new ConcurrencyController({
    maxGlobalParallelism: options?.maxGlobalParallelism ?? 4,
  });

  const scheduler = new TaskScheduler(
    taskManager,
    concurrency,
    agentRegistry,
    eventBus
  );

  if (options?.dangerouslySkipPermissions) {
    permissionManager.setDangerouslySkipPermissions(true);
  }

  const orchestrator = new CoAgentOrchestrator(
    taskManager,
    scheduler,
    agentRegistry,
    contextManager,
    messageBus,
    permissionManager,
    eventBus,
    {
      workingDirectory: options?.workingDirectory ?? process.cwd(),
      maxGlobalParallelism: options?.maxGlobalParallelism ?? 4,
      dangerouslySkipPermissions: options?.dangerouslySkipPermissions,
      enableWorktrees: options?.enableWorktrees,
      enableSelfHealing: options?.enableSelfHealing,
    }
  );

  // Registra os 4 adaptadores oficiais
  orchestrator.registerAdapter(new AgyAdapter());
  orchestrator.registerAdapter(new ClaudeCodeAdapter());
  orchestrator.registerAdapter(new CodexAdapter());
  orchestrator.registerAdapter(new OpenCodeAdapter());

  return {
    db,
    taskManager,
    scheduler,
    agentRegistry,
    contextManager,
    messageBus,
    permissionManager,
    eventBus,
    orchestrator,
  };
}
