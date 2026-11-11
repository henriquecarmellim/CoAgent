import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase, TaskRepository } from '../../packages/storage/src/index.js';
import {
  AgentRegistry,
  TaskManager,
  PermissionManager,
  ContextManager,
  EventBus,
} from '../../packages/core/src/index.js';
import {
  ConcurrencyController,
  PriorityTaskQueue,
  DagValidator,
  TaskScheduler,
} from '../../packages/scheduler/src/index.js';
import { Task, TaskDefinition } from '../../packages/protocol/src/index.js';
import { sleep } from '../../packages/shared/src/index.js';

describe('CoAgent Core & Scheduler Test Suite', () => {
  let db: SQLiteDatabase;
  let taskRepo: TaskRepository;
  let eventBus: EventBus;
  let taskManager: TaskManager;
  let agentRegistry: AgentRegistry;
  let permissionManager: PermissionManager;
  let contextManager: ContextManager;

  beforeEach(() => {
    db = new SQLiteDatabase({ filename: ':memory:' });
    db.connect();
    taskRepo = new TaskRepository(db.getRawDb());
    eventBus = new EventBus();
    taskManager = new TaskManager(taskRepo, eventBus);
    agentRegistry = new AgentRegistry(eventBus);
    permissionManager = new PermissionManager();
    contextManager = new ContextManager();
  });

  afterEach(() => {
    db.close();
  });

  describe('1. Persistência e TaskRepository', () => {
    it('deve criar e recuperar uma tarefa no SQLite', () => {
      const taskDef: TaskDefinition = {
        title: 'Criar Módulo de Autenticação',
        description: 'Implementar fluxo JWT',
        type: 'implementation',
        priority: 'high',
        dependsOn: [],
        timeoutMs: 60000,
        maxRetries: 2,
        metadata: {},
      };

      const created = taskManager.createTask(taskDef);
      expect(created.id).toBeDefined();
      expect(created.status).toBe('pending');

      const retrieved = taskManager.getTask(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Criar Módulo de Autenticação');
      expect(retrieved?.priority).toBe('high');
    });

    it('deve respeitar transições válidas de status', () => {
      const task = taskManager.createTask({
        title: 'Tarefa de Teste',
        type: 'testing',
        priority: 'normal',
      });

      // pending -> queued
      const queued = taskManager.transitionStatus(task.id, 'queued');
      expect(queued.status).toBe('queued');

      // queued -> running
      const running = taskManager.transitionStatus(task.id, 'running');
      expect(running.status).toBe('running');
      expect(running.startedAt).toBeDefined();

      // running -> completed
      const completed = taskManager.transitionStatus(task.id, 'completed', {
        result: { success: true },
      });
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeDefined();
    });

    it('deve rejeitar transições ilegais de status', () => {
      const task = taskManager.createTask({
        title: 'Tarefa Ilegal',
        type: 'testing',
        priority: 'normal',
      });

      // pending -> completed direto não é permitido pela matriz de transição
      expect(() => {
        taskManager.transitionStatus(task.id, 'completed');
      }).toThrowError(/Transição de estado inválida/);
    });
  });

  describe('2. AgentRegistry & Capacidades', () => {
    it('deve registrar agentes e gerenciar carga ativa', () => {
      agentRegistry.register({
        id: 'claude-code',
        name: 'Claude Code CLI',
        provider: 'claude-code',
        version: '2.1.322',
        description: 'Agente de Engenharia de Software',
        capabilities: {
          supportedTaskTypes: ['implementation', 'refactoring', 'code_review'],
          supportsStreaming: true,
          supportsSessions: true,
          supportsTools: true,
          supportsMcp: true,
          maxConcurrency: 2,
          permissionLevels: ['workspace-write'],
          availableModels: ['claude-3-7-sonnet'],
        },
        status: 'idle',
        activeTasksCount: 0,
        totalTasksCompleted: 0,
        totalTasksFailed: 0,
      });

      const agent = agentRegistry.getAgent('claude-code');
      expect(agent).not.toBeNull();
      expect(agent?.status).toBe('idle');

      // Incrementa primeira tarefa
      agentRegistry.incrementActiveTasks('claude-code');
      expect(agentRegistry.getAgent('claude-code')?.activeTasksCount).toBe(1);
      expect(agentRegistry.getAgent('claude-code')?.status).toBe('idle');

      // Incrementa segunda tarefa (atinge maxConcurrency = 2)
      agentRegistry.incrementActiveTasks('claude-code');
      expect(agentRegistry.getAgent('claude-code')?.activeTasksCount).toBe(2);
      expect(agentRegistry.getAgent('claude-code')?.status).toBe('busy');

      // Decrementa tarefa completada
      agentRegistry.decrementActiveTasks('claude-code', true);
      expect(agentRegistry.getAgent('claude-code')?.activeTasksCount).toBe(1);
      expect(agentRegistry.getAgent('claude-code')?.status).toBe('idle');
      expect(agentRegistry.getAgent('claude-code')?.totalTasksCompleted).toBe(1);
    });
  });

  describe('3. PermissionManager & Segurança', () => {
    it('deve bloquear comandos destrutivos perigosos', () => {
      const check = permissionManager.checkCommand({
        command: 'rm -rf /',
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('proibida');
    });

    it('deve bloquear execução em modo read-only', () => {
      const readOnlyPolicy = permissionManager.getPolicyForLevel('read-only');
      const check = permissionManager.checkCommand(
        { command: 'npm test' },
        readOnlyPolicy
      );
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('read-only');
    });
  });

  describe('4. ContextManager & Contexto Seletivo', () => {
    it('deve armazenar e recuperar contexto sem vazar todo o histórico', () => {
      contextManager.storeContext('git_diff_auth', 'diff --git a/auth.ts b/auth.ts...', {
        summary: 'Adicionado middleware JWT',
        tags: ['auth', 'security'],
      });

      const fullContext = contextManager.getSelectiveContext(['git_diff_auth'], false);
      expect(fullContext).toContain('diff --git a/auth.ts');

      const summaryOnly = contextManager.getSelectiveContext(['git_diff_auth'], true);
      expect(summaryOnly).toContain('Adicionado middleware JWT');
      expect(summaryOnly).not.toContain('diff --git');
    });
  });

  describe('5. DAG & Prevenção de Deadlocks', () => {
    it('deve detectar ciclo direto de dependência (A -> B -> A)', () => {
      const taskA = { id: 'A', dependsOn: ['B'] } as Task;
      const taskB = { id: 'B', dependsOn: ['A'] } as Task;

      expect(() => {
        DagValidator.validateNoCycles([taskA, taskB]);
      }).toThrowError(/Ciclo de dependência detectado/);
    });

    it('deve permitir grafo linear acíclico válido (A -> B -> C)', () => {
      const taskA = { id: 'A', dependsOn: [] } as Task;
      const taskB = { id: 'B', dependsOn: ['A'] } as Task;
      const taskC = { id: 'C', dependsOn: ['B'] } as Task;

      expect(() => {
        DagValidator.validateNoCycles([taskA, taskB, taskC]);
      }).not.toThrow();
    });
  });

  describe('6. ConcurrencyController (Semáforo de 4 Slots)', () => {
    it('deve respeitar o limite global de 4 slots simultâneos', async () => {
      const concurrency = new ConcurrencyController({ maxGlobalParallelism: 4 });
      expect(concurrency.activeGlobal).toBe(0);

      const release1 = await concurrency.acquire('claude-code');
      const release2 = await concurrency.acquire('codex');
      const release3 = await concurrency.acquire('agy');
      const release4 = await concurrency.acquire('opencode');

      expect(concurrency.activeGlobal).toBe(4);
      expect(concurrency.canAcquire()).toBe(false);

      // Libera 1 slot
      release1();
      expect(concurrency.activeGlobal).toBe(3);
      expect(concurrency.canAcquire()).toBe(true);

      release2();
      release3();
      release4();
      expect(concurrency.activeGlobal).toBe(0);
    });
  });

  describe('7. PriorityTaskQueue', () => {
    it('deve ordenar tarefas por criticidade (critical > high > normal > low)', () => {
      const queue = new PriorityTaskQueue();

      const lowTask = { id: '1', priority: 'low', createdAt: '2026-11-11T10:00:00Z' } as Task;
      const criticalTask = { id: '2', priority: 'critical', createdAt: '2026-11-11T10:01:00Z' } as Task;
      const normalTask = { id: '3', priority: 'normal', createdAt: '2026-11-11T10:02:00Z' } as Task;
      const highTask = { id: '4', priority: 'high', createdAt: '2026-11-11T10:03:00Z' } as Task;

      queue.enqueue(lowTask);
      queue.enqueue(criticalTask);
      queue.enqueue(normalTask);
      queue.enqueue(highTask);

      expect(queue.dequeue()?.id).toBe('2'); // critical
      expect(queue.dequeue()?.id).toBe('4'); // high
      expect(queue.dequeue()?.id).toBe('3'); // normal
      expect(queue.dequeue()?.id).toBe('1'); // low
    });
  });

  describe('8. TaskScheduler & Execução Concorrente', () => {
    it('deve agendar e executar tarefas paralelas com sucesso', async () => {
      const concurrency = new ConcurrencyController({ maxGlobalParallelism: 4 });
      const scheduler = new TaskScheduler(taskManager, concurrency, agentRegistry, eventBus);

      const executedTaskIds: string[] = [];

      scheduler.setExecutionHandler(async (task) => {
        await sleep(50);
        executedTaskIds.push(task.id);
        return { executed: true };
      });

      const t1 = taskManager.createTask({ title: 'Task 1', type: 'general', priority: 'high' });
      const t2 = taskManager.createTask({ title: 'Task 2', type: 'general', priority: 'high' });

      scheduler.submitTask(t1);
      scheduler.submitTask(t2);

      // Aguarda execução
      await sleep(150);

      expect(executedTaskIds).toContain(t1.id);
      expect(executedTaskIds).toContain(t2.id);

      const finalT1 = taskManager.getTask(t1.id);
      const finalT2 = taskManager.getTask(t2.id);
      expect(finalT1?.status).toBe('completed');
      expect(finalT2?.status).toBe('completed');
    });

    it('deve cancelar tarefa em execução via AbortSignal', async () => {
      const concurrency = new ConcurrencyController({ maxGlobalParallelism: 4 });
      const scheduler = new TaskScheduler(taskManager, concurrency, agentRegistry, eventBus);

      let signalAborted = false;

      scheduler.setExecutionHandler(async (task, signal) => {
        signal.addEventListener('abort', () => {
          signalAborted = true;
        });
        await sleep(500);
        return { completed: true };
      });

      const task = taskManager.createTask({ title: 'Long Task', type: 'general', priority: 'normal' });
      scheduler.submitTask(task);

      await sleep(20); // Aguarda entrar no estado running
      scheduler.cancelRunningTask(task.id, 'Teste de cancelamento');

      expect(signalAborted).toBe(true);
      const updated = taskManager.getTask(task.id);
      expect(updated?.status).toBe('cancelled');
    });
  });
});
