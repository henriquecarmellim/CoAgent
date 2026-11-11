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

  it('deve inicializar com os adaptadores registrados (incluindo as 2 instâncias de Antigravity: agy-1 e agy-2)', () => {
    const agents = coagent.agentRegistry.listAgents();
    expect(agents.length).toBe(6);

    const agentIds = agents.map((a) => a.id);
    expect(agentIds).toContain('agy-1');
    expect(agentIds).toContain('agy-2');
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
    expect(status.agents.length).toBe(6);
    expect(status.concurrency.max).toBe(4);
    expect(status.concurrency.active).toBe(0);
    expect(status.activeTasks.length).toBe(0);
  });

  it('deve executar cascata de inteligência com fallback até zerar tarefas', async () => {
    const executionLogs: string[] = [];
    const simulatedError = new Error('429 Rate Limit / Quota esgotada no modelo pro-max');

    // Executa tarefa via cascata onde agy-1 falha por quota e agy-2 assume com sucesso
    const result = await coagent.cascader.executeWithCascade(
      {
        title: 'Gerar script de deploy',
        description: 'Criar pipeline seguro de deploy',
        preferredAgent: 'agy-1',
      },
      async (agentId, model) => {
        executionLogs.push(`${agentId}:${model}`);
        if (agentId === 'agy-1') {
          throw simulatedError;
        }
        return { success: true, agentId, model, output: 'Deploy gerado com sucesso via agy-2!' };
      }
    );

    expect(result.success).toBe(true);
    expect(result.agentId).toBe('agy-2');
    expect(executionLogs).toEqual(['agy-1:gemini-2.5-pro', 'agy-2:gemini-2.5-flash']);
  });
});
