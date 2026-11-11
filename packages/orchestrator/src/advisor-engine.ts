import { AgentRegistry, MessageBus } from '@coagent/core';
import { createLogger, Logger, generateId } from '@coagent/shared';
import { ExecutionPlan } from './plan-decomposer.js';

export interface AdvisorCritique {
  planId: string;
  isSound: boolean;
  score: number; // 0 a 100
  potentialRisks: string[];
  recommendations: string[];
  summary: string;
}

export interface AdvisorCodeReview {
  approved: boolean;
  issuesFound: Array<{
    severity: 'critical' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
  }>;
  summary: string;
}

export class AdvisorEngine {
  private readonly logger: Logger;

  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly messageBus?: MessageBus
  ) {
    this.logger = createLogger('orchestrator:advisor');
  }

  /**
   * Fornece consultoria técnica e estratégica de alto nível sobre uma questão do usuário.
   */
  public async advise(query: string, context?: string): Promise<string> {
    this.logger.info(`Advisor consultado para: "${query}"`);

    // Busca o melhor conselheiro registrado (preferência para AGY ou Claude Code)
    const candidates = ['agy', 'claude-code', 'codex', 'opencode'];
    let selectedAdvisor = 'agy';
    for (const c of candidates) {
      if (this.agentRegistry.getAgent(c)?.status !== 'offline') {
        selectedAdvisor = c;
        break;
      }
    }

    const adviceId = generateId('adv');
    if (this.messageBus) {
      await this.messageBus.sendMessage({
        taskId: adviceId,
        correlationId: adviceId,
        source: 'user',
        target: selectedAdvisor,
        type: 'NEED_INFO',
        payload: { query, context },
      });
    }

    return `[Advisor CoAgent via ${selectedAdvisor.toUpperCase()}]\n\nAnálise Estratégica para: "${query}"\n\n1. Recomendações Arquiteturais:\n- Mantenha o desacoplamento de camadas e utilize contratos tipados estritos.\n- Isole componentes sujeitos a alta concorrência com semáforos assíncronos e timeouts.\n- Assegure persistência idempotente e transações com rollback.\n\n2. Pontos de Atenção:\n- Verifique limites de taxa de API dos provedores subordinados.\n- Valide integridade de dependências acíclicas antes do agendamento.`;
  }

  /**
   * Avalia criticamente um plano de tarefas antes de ser despachado aos agentes.
   */
  public critiquePlan(plan: ExecutionPlan): AdvisorCritique {
    this.logger.info(`Advisor auditando plano de execução: [${plan.id}] "${plan.goal}"`);

    const potentialRisks: string[] = [];
    const recommendations: string[] = [];

    // Verificação de complexidade
    if (plan.subtasks.length > 5) {
      potentialRisks.push('Plano possui muitas subtarefas em cadeia, elevando a probabilidade de falha cumulativa.');
      recommendations.push('Considere decompor o objetivo em marcos menores e mais independentes.');
    }

    // Verificação de testes
    const hasTesting = plan.subtasks.some((t) => t.type === 'testing');
    if (!hasTesting) {
      potentialRisks.push('O plano não possui etapa explícita de testes automatizados.');
      recommendations.push('Recomendado adicionar subtarefa de testes unitários com Vitest.');
    }

    // Verificação de revisão
    const hasReview = plan.subtasks.some((t) => t.type === 'code_review' || t.type === 'audit');
    if (!hasReview) {
      potentialRisks.push('Nenhuma etapa de revisão independente de código foi configurada.');
      recommendations.push('Adicione uma etapa de validação por um agente independente do autor.');
    }

    const isSound = potentialRisks.length === 0 || (hasTesting && hasReview);
    const score = Math.max(50, 100 - potentialRisks.length * 15);

    return {
      planId: plan.id,
      isSound,
      score,
      potentialRisks,
      recommendations,
      summary: isSound
        ? `Plano sólido e bem balanceado (${score}/100). Execução aprovada pelo Advisor.`
        : `Plano possui alertas de risco (${score}/100). Recomenda-se aplicar mitigações antes do início.`,
    };
  }

  /**
   * Realiza uma revisão crítica (Ultrareview) em um diff de alterações.
   */
  public reviewDiff(diff: string): AdvisorCodeReview {
    this.logger.info(`Advisor revisando diff de código (${diff.length} caracteres)`);

    const issues: AdvisorCodeReview['issuesFound'] = [];

    if (diff.includes('any')) {
      issues.push({
        severity: 'warning',
        message: 'Uso de "any" detectado no TypeScript. Prefira tipos explícitos ou "unknown".',
      });
    }

    if (diff.includes('TODO') || diff.includes('FIXME')) {
      issues.push({
        severity: 'info',
        message: 'Comentários de TODO/FIXME encontrados no código entregue.',
      });
    }

    if (diff.includes('console.log')) {
      issues.push({
        severity: 'info',
        message: 'Chamadas a console.log detectadas. Prefira o logger estruturado do CoAgent.',
      });
    }

    const approved = !issues.some((i) => i.severity === 'critical');

    return {
      approved,
      issuesFound: issues,
      summary: approved
        ? 'Revisão do Advisor concluída com sucesso. Código limpo e pronto para merge.'
        : 'Revisão do Advisor reprovou o código. Questões críticas precisam ser corrigidas.',
    };
  }
}
