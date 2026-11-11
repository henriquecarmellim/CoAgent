import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase } from '../../packages/storage/src/index.js';
import { bootstrapCoAgent, CoAgentInstance, AdvisorEngine, SelfHealingController } from '../../packages/orchestrator/src/index.js';
import { Task } from '../../packages/protocol/src/index.js';

describe('Advisor, Self-Healing & Advanced Features Test Suite', () => {
  let coagent: CoAgentInstance;

  beforeEach(() => {
    coagent = bootstrapCoAgent({ dbPath: ':memory:' });
  });

  afterEach(() => {
    coagent.db.close();
  });

  describe('1. CoAgent Advisor', () => {
    it('deve auditar um plano de tarefas (critiquePlan) e calcular score de solidez', () => {
      const advisor = new AdvisorEngine(coagent.agentRegistry);
      const plan = coagent.orchestrator.planDecomposer.decomposeObjective('Criar módulo de pagamentos com Stripe');

      const critique = advisor.critiquePlan(plan);
      expect(critique.score).toBeGreaterThan(0);
      expect(critique.isSound).toBe(true);
      expect(critique.recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('deve realizar ultrareview de código em um diff', () => {
      const advisor = new AdvisorEngine(coagent.agentRegistry);
      const cleanDiff = `
diff --git a/src/auth.ts b/src/auth.ts
+ export function authenticateUser(token: string): boolean {
+   return token.length > 0;
+ }
`;
      const reviewClean = advisor.reviewDiff(cleanDiff);
      expect(reviewClean.approved).toBe(true);

      const riskyDiff = `
diff --git a/src/auth.ts b/src/auth.ts
+ export function authenticate(data: any): any {
+   // TODO: implementar segurança
+   console.log(data);
+ }
`;
      const reviewRisky = advisor.reviewDiff(riskyDiff);
      expect(reviewRisky.issuesFound.length).toBeGreaterThan(0);
    });

    it('deve fornecer parecer técnico estruturado via advise()', async () => {
      const advisor = new AdvisorEngine(coagent.agentRegistry);
      const advice = await advisor.advise('Como estruturar mensageria distribuída com RabbitMQ?');
      expect(advice).toContain('Advisor CoAgent');
      expect(advice).toContain('Recomendações Arquiteturais');
    });
  });

  describe('2. Self-Healing Loop', () => {
    it('deve diagnosticar falha de compilação e propor subtarefa de auto-cura', () => {
      const selfHealing = new SelfHealingController();
      const failedTask = {
        id: 'task_failed_123',
        title: 'Criar componente Button',
        error: {
          code: 'AGENT_EXECUTION_FAILED',
          message: 'error TS2322: Type "string" is not assignable to type "number".',
        },
      } as Task;

      const diagnosis = selfHealing.diagnoseAndHeal(failedTask);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.healingTaskDefinition.type).toBe('debugging');
      expect(diagnosis?.healingTaskDefinition.title).toContain('[Self-Healing]');
      expect(diagnosis?.healingTaskDefinition.priority).toBe('critical');
    });
  });

  describe('3. Project Memory (COAGENT.md)', () => {
    it('deve carregar diretrizes de COAGENT.md e injetar nos prompts', () => {
      const memory = coagent.orchestrator.projectMemory;
      const content = memory.loadMemory();
      expect(content).toContain('COAGENT.md');

      const formatted = memory.formatPromptContext('Implemente a rota /login');
      expect(formatted).toContain('DIRETRIZES DO PROJETO');
      expect(formatted).toContain('Implemente a rota /login');
    });
  });

  describe('4. Dangerously Skip Permissions', () => {
    it('deve auto-aprovar comandos mesmo destrutivos quando a opção estiver ativada', () => {
      // Sem bypass -> bloqueia
      const blocked = coagent.permissionManager.checkCommand({ command: 'rm -rf /' });
      expect(blocked.allowed).toBe(false);

      // Com bypass ativado -> libera
      coagent.permissionManager.setDangerouslySkipPermissions(true);
      const allowed = coagent.permissionManager.checkCommand({ command: 'rm -rf /' });
      expect(allowed.allowed).toBe(true);
      expect(allowed.requiresApproval).toBe(false);
    });
  });
});
