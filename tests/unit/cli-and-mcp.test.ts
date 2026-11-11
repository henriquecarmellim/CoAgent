import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootstrapCoAgent, CoAgentInstance } from '../../packages/orchestrator/src/index.js';

describe('CoAgent Bootstrap & Integrations Test Suite', () => {
  let coagent: CoAgentInstance;

  beforeEach(() => {
    coagent = bootstrapCoAgent({ dbPath: ':memory:' });
  });

  afterEach(() => {
    coagent.db.close();
  });

  it('deve inicializar com os 4 adaptadores oficiais registrados', () => {
    const agents = coagent.agentRegistry.listAgents();
    expect(agents.length).toBe(4);

    const agentIds = agents.map((a) => a.id);
    expect(agentIds).toContain('agy');
    expect(agentIds).toContain('claude-code');
    expect(agentIds).toContain('codex');
    expect(agentIds).toContain('opencode');
  });

  it('deve criar e enfileirar tarefa com delegação automática', () => {
    const task = coagent.taskManager.createTask({
      title: 'Auditar segurança de dependências',
      type: 'audit',
      priority: 'high',
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe('pending');

    coagent.scheduler.submitTask(task);
    const updated = coagent.taskManager.getTask(task.id);
    expect(updated?.status).toBe('queued');
  });

  it('deve fornecer status completo do sistema e concorrência', () => {
    const status = coagent.orchestrator.getSystemStatus();
    expect(status.agents.length).toBe(4);
    expect(status.concurrency.max).toBe(4);
    expect(status.concurrency.active).toBe(0);
    expect(status.activeTasks.length).toBe(0);
  });
});
