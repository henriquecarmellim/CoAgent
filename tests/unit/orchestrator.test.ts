import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase, TaskRepository } from '../../packages/storage/src/index.js';
import {
  AgentRegistry,
  TaskManager,
  PermissionManager,
  ContextManager,
  MessageBus,
  EventBus,
} from '../../packages/core/src/index.js';
import { ConcurrencyController, TaskScheduler } from '../../packages/scheduler/src/index.js';
import {
  SmartDelegator,
  PlanDecomposer,
  ResultAggregator,
  CoAgentOrchestrator,
} from '../../packages/orchestrator/src/index.js';
import { AgentAdapter, AdapterExecutionOptions, AdapterExecutionResult } from '../../packages/adapters/src/index.js';
import { AgentMetadata, AgentProvider, Task } from '../../packages/protocol/src/index.js';
import { sleep } from '../../packages/shared/src/index.js';

class MockAdapter implements AgentAdapter {
  constructor(
    public readonly id: string,
    public readonly provider: AgentProvider,
    private readonly executionDelayMs = 20
  ) {}

  public getMetadata(): AgentMetadata {
    return {
      id: this.id,
      name: `Mock ${this.id}`,
      provider: this.provider,
      version: '1.0.0',
      description: 'Mock para testes unitários',
      capabilities: {
        supportedTaskTypes: [
          'research',
          'architecture',
          'implementation',
          'testing',
          'code_review',
          'refactoring',
          'audit',
          'documentation',
          'general',
        ],
        supportsStreaming: true,
        supportsSessions: true,
        supportsTools: true,
        supportsMcp: true,
        maxConcurrency: 2,
        permissionLevels: ['workspace-write'],
        availableModels: ['test-model'],
      },
      status: 'idle',
      activeTasksCount: 0,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
    };
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async execute(options: AdapterExecutionOptions): Promise<AdapterExecutionResult> {
    await sleep(this.executionDelayMs);
    return {
      output: `Resultado simulado para tarefa ${options.task.id} pelo agente ${this.id}`,
      rawJson: { success: true, taskId: options.task.id, agent: this.id },
      exitCode: 0,
      durationMs: this.executionDelayMs,
    };
  }
}

describe('Orchestrator Test Suite', () => {
  let db: SQLiteDatabase;
  let taskRepo: TaskRepository;
  let eventBus: EventBus;
  let taskManager: TaskManager;
  let agentRegistry: AgentRegistry;
  let permissionManager: PermissionManager;
  let contextManager: ContextManager;
  let messageBus: MessageBus;
  let concurrency: ConcurrencyController;
  let scheduler: TaskScheduler;
  let orchestrator: CoAgentOrchestrator;

  beforeEach(() => {
    db = new SQLiteDatabase({ filename: ':memory:' });
    db.connect();
    taskRepo = new TaskRepository(db.getRawDb());
    eventBus = new EventBus();
    taskManager = new TaskManager(taskRepo, eventBus);
    agentRegistry = new AgentRegistry(eventBus);
    permissionManager = new PermissionManager();
    contextManager = new ContextManager();
    messageBus = new MessageBus(undefined, eventBus);
    concurrency = new ConcurrencyController({ maxGlobalParallelism: 4 });
    scheduler = new TaskScheduler(taskManager, concurrency, agentRegistry, eventBus);

    orchestrator = new CoAgentOrchestrator(
      taskManager,
      scheduler,
      agentRegistry,
      contextManager,
      messageBus,
      permissionManager,
      eventBus
    );

    // Registra os 4 adaptadores mockados
    orchestrator.registerAdapter(new MockAdapter('agy', 'agy'));
    orchestrator.registerAdapter(new MockAdapter('claude-code', 'claude-code'));
    orchestrator.registerAdapter(new MockAdapter('codex', 'codex'));
    orchestrator.registerAdapter(new MockAdapter('opencode', 'opencode'));
  });

  afterEach(() => {
    db.close();
  });

  describe('1. PlanDecomposer', () => {
    it('deve decompor objetivo de feature em DAG com 4 fases ordenadas', () => {
      const decomposer = new PlanDecomposer();
      const plan = decomposer.decomposeObjective('Criar pipeline de CI/CD distribuído');

      expect(plan.subtasks.length).toBe(4);
      expect(plan.subtasks[0]?.type).toBe('architecture');
      expect(plan.subtasks[1]?.type).toBe('implementation');
      expect(plan.subtasks[2]?.type).toBe('testing');
      expect(plan.subtasks[3]?.type).toBe('code_review');

      // Verifica dependências do DAG
      expect(plan.subtasks[1]?.dependsOnTempIds).toContain(plan.subtasks[0]?.tempId);
      expect(plan.subtasks[3]?.dependsOnTempIds).toContain(plan.subtasks[1]?.tempId);
    });
  });

  describe('2. SmartDelegator', () => {
    it('deve garantir que o agente revisor seja diferente do agente implementador', () => {
      const delegator = new SmartDelegator(agentRegistry);

      // Simula tarefa de implementação atribuída ao claude-code
      const implTask = { id: 'task_impl', type: 'implementation' } as Task;
      const implAgent = delegator.selectBestAgent(implTask);
      expect(implAgent.id).toBeDefined();

      // Tarefa de revisão com restrição de autor
      const reviewTask = { id: 'task_review', type: 'code_review' } as Task;
      const reviewerAgent = delegator.selectBestAgent(reviewTask, {
        excludeAgentId: implAgent.id,
      });

      expect(reviewerAgent.id).not.toBe(implAgent.id);
    });
  });

  describe('3. ResultAggregator', () => {
    it('deve consolidar status e gerar métricas', () => {
      const aggregator = new ResultAggregator();
      const mockTasks: Task[] = [
        {
          id: '1',
          title: 'T1',
          status: 'completed',
          assignedAgent: 'claude-code',
          result: { ok: true },
          startedAt: '2026-11-11T12:00:00Z',
          completedAt: '2026-11-11T12:00:02Z',
        } as Task,
        {
          id: '2',
          title: 'T2',
          status: 'completed',
          assignedAgent: 'codex',
          result: { ok: true },
          startedAt: '2026-11-11T12:00:02Z',
          completedAt: '2026-11-11T12:00:05Z',
        } as Task,
      ];

      const res = aggregator.aggregate('Meu Objetivo', mockTasks);
      expect(res.totalTasks).toBe(2);
      expect(res.completedTasks).toBe(2);
      expect(res.failedTasks).toBe(0);
      expect(res.success).toBe(true);
      expect(res.durationMs).toBe(5000);
    });
  });

  describe('4. CoAgentOrchestrator End-to-End', () => {
    it('deve executar um plano completo distribuído entre múltiplos agentes', async () => {
      const result = await orchestrator.executeObjective('Criar microserviço de mensageria');

      expect(result.success).toBe(true);
      expect(result.totalTasks).toBe(4);
      expect(result.completedTasks).toBe(4);
      expect(result.failedTasks).toBe(0);

      // Status do sistema
      const status = orchestrator.getSystemStatus();
      expect(status.agents.length).toBe(4);
      expect(status.activeTasks.length).toBe(0);
    });
  });
});
