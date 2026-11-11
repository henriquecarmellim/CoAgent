import { TaskDefinitionInput, TaskType } from '@coagent/protocol';
import { generateId, createLogger, Logger } from '@coagent/shared';

export interface PlannedSubtask {
  tempId: string;
  title: string;
  description: string;
  type: TaskType;
  priority: 'critical' | 'high' | 'normal' | 'low';
  dependsOnTempIds: string[];
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  subtasks: PlannedSubtask[];
  estimatedTotalSteps: number;
}

export class PlanDecomposer {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger('orchestrator:plan-decomposer');
  }

  /**
   * Decompõe um objetivo macro em um plano de execução coordenado.
   * Em produção, isso pode ser enriquecido via LLM ou templates heurísticos.
   */
  public decomposeObjective(goal: string): ExecutionPlan {
    this.logger.info(`Decompondo objetivo macro: "${goal}"`);

    const planId = generateId('plan');
    const lower = goal.toLowerCase();

    // Heurística de decomposição inteligente para engenharia de software
    const subtasks: PlannedSubtask[] = [];

    const isFeatureRequest =
      lower.includes('criar') ||
      lower.includes('desenvolver') ||
      lower.includes('implementar') ||
      lower.includes('adicionar');

    const isRefactor = lower.includes('refatorar') || lower.includes('otimizar');
    const isAudit = lower.includes('auditar') || lower.includes('revisar') || lower.includes('segurança');

    if (isFeatureRequest) {
      // 1. Arquitetura e Especificação
      subtasks.push({
        tempId: 'step_1_arch',
        title: `Especificação e Arquitetura: ${goal}`,
        description: `Definir especificações de requisitos, interfaces e modelagem técnica para: ${goal}`,
        type: 'architecture',
        priority: 'high',
        dependsOnTempIds: [],
      });

      // 2. Implementação do Código
      subtasks.push({
        tempId: 'step_2_impl',
        title: `Implementação Técnica: ${goal}`,
        description: `Escrever o código-fonte principal conforme especificação arquitetural definida`,
        type: 'implementation',
        priority: 'high',
        dependsOnTempIds: ['step_1_arch'],
      });

      // 3. Testes Unitários e Validação
      subtasks.push({
        tempId: 'step_3_test',
        title: `Testes e Validação: ${goal}`,
        description: `Criar suíte de testes unitários e de integração para validar a implementação`,
        type: 'testing',
        priority: 'normal',
        dependsOnTempIds: ['step_2_impl'],
      });

      // 4. Revisão Independente de Código
      subtasks.push({
        tempId: 'step_4_review',
        title: `Revisão de Código Independente: ${goal}`,
        description: `Auditar o código gerado por um agente revisor independente antes do aceite final`,
        type: 'code_review',
        priority: 'normal',
        dependsOnTempIds: ['step_2_impl', 'step_3_test'],
      });
    } else if (isRefactor) {
      subtasks.push({
        tempId: 'step_1_research',
        title: `Análise e Diagnóstico de Refatoração: ${goal}`,
        description: `Mapear pontos críticos, gargalos e dependências a serem refatoradas`,
        type: 'research',
        priority: 'high',
        dependsOnTempIds: [],
      });

      subtasks.push({
        tempId: 'step_2_refactor',
        title: `Execução da Refatoração: ${goal}`,
        description: `Aplicar mudanças estruturais no código-fonte mantendo compatibilidade`,
        type: 'refactoring',
        priority: 'high',
        dependsOnTempIds: ['step_1_research'],
      });

      subtasks.push({
        tempId: 'step_3_verify',
        title: `Verificação e Testes de Regressão: ${goal}`,
        description: `Executar bateria de testes para assegurar ausência de regressões`,
        type: 'testing',
        priority: 'critical',
        dependsOnTempIds: ['step_2_refactor'],
      });
    } else if (isAudit) {
      subtasks.push({
        tempId: 'step_1_audit',
        title: `Auditoria e Análise Técnica: ${goal}`,
        description: `Escanear vulnerabilidades, riscos de concorrência e conformidade de arquitetura`,
        type: 'audit',
        priority: 'high',
        dependsOnTempIds: [],
      });

      subtasks.push({
        tempId: 'step_2_report',
        title: `Relatório Consolidado de Auditoria: ${goal}`,
        description: `Gerar documentação com achados, níveis de severidade e recomendações de mitigação`,
        type: 'documentation',
        priority: 'normal',
        dependsOnTempIds: ['step_1_audit'],
      });
    } else {
      // Tarefa Geral Direta
      subtasks.push({
        tempId: 'step_1_general',
        title: goal,
        description: goal,
        type: 'general',
        priority: 'normal',
        dependsOnTempIds: [],
      });
    }

    return {
      id: planId,
      goal,
      subtasks,
      estimatedTotalSteps: subtasks.length,
    };
  }

  /**
   * Converte subtasks planejadas em TaskDefinitions prontas para persistência no TaskManager.
   */
  public toTaskDefinitions(plan: ExecutionPlan, parentTaskId?: string): TaskDefinitionInput[] {
    const tempToRealIdMap = new Map<string, string>();
    for (const sub of plan.subtasks) {
      tempToRealIdMap.set(sub.tempId, generateId('task'));
    }

    return plan.subtasks.map((sub) => {
      const realId = tempToRealIdMap.get(sub.tempId)!;
      const realDependencies = sub.dependsOnTempIds.map((temp) => tempToRealIdMap.get(temp)!);

      return {
        id: realId,
        parentTaskId,
        title: sub.title,
        description: sub.description,
        type: sub.type,
        priority: sub.priority,
        dependsOn: realDependencies,
        metadata: {
          planId: plan.id,
          tempStepId: sub.tempId,
        },
      };
    });
  }
}
