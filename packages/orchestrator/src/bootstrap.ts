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
import { IntelligenceCascader } from './intelligence-cascader.js';

export interface BootstrapOptions {
  dbPath?: string;
  maxGlobalParallelism?: number;
  workingDirectory?: string;
  dangerouslySkipPermissions?: boolean;
  enableWorktrees?: boolean;
  enableSelfHealing?: boolean;
  agyInstances?: number; // Padrão: 2
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
  cascader: IntelligenceCascader;
}

export function bootstrapCoAgent(options?: BootstrapOptions): CoAgentInstance {
  const dbPath = options?.dbPath ?? join(homedir(), '.coagent', 'coagent.db');
  const db = new SQLiteDatabase({ filename: dbPath });
  db.connect();

  const rawDb = db.getRawDb();
  const taskRepo = new TaskRepository(rawDb);
  const messageRepo = new MessageRepository(rawDb);
  const sessionRepo = new SessionRepository(rawDb);
  void sessionRepo;

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

  // Registro de Instâncias dos Agentes
  const agyCount = options?.agyInstances ?? 2;
  if (agyCount >= 2) {
    // 2 Instâncias de Antigravity (como solicitado pelo usuário: 1 Ultra e 1 Rápido)
    orchestrator.registerAdapter(
      new AgyAdapter('agy-1', {
        displayName: 'Google Antigravity #1 (Pro Max)',
        defaultModel: 'gemini-2.5-pro',
        maxConcurrency: 1,
      })
    );
    orchestrator.registerAdapter(
      new AgyAdapter('agy-2', {
        displayName: 'Google Antigravity #2 (Flash)',
        defaultModel: 'gemini-2.5-flash',
        maxConcurrency: 1,
      })
    );
    // Alias para compatibilidade
    orchestrator.registerAdapter(
      new AgyAdapter('agy', {
        displayName: 'Google Antigravity (Default)',
        defaultModel: 'gemini-2.5-pro',
        maxConcurrency: 2,
      })
    );
  } else {
    orchestrator.registerAdapter(new AgyAdapter('agy'));
  }

  // Claude Code CLI
  orchestrator.registerAdapter(new ClaudeCodeAdapter('claude-code', { defaultModel: 'claude-3-7-sonnet' }));

  // OpenAI Codex CLI
  orchestrator.registerAdapter(new CodexAdapter('codex', { defaultModel: 'o3' }));

  // OpenCode CLI
  orchestrator.registerAdapter(new OpenCodeAdapter('opencode'));

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
    cascader: orchestrator.cascader,
  };
}
