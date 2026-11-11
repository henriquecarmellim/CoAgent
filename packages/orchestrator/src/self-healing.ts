import { Task, TaskDefinitionInput } from '@coagent/protocol';
import { createLogger, Logger } from '@coagent/shared';

export interface SelfHealingDiagnosis {
  originalTaskId: string;
  healingTaskDefinition: TaskDefinitionInput;
  reason: string;
}

export class SelfHealingController {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger('orchestrator:self-healing');
  }

  /**
   * Avalia a falha de uma tarefa e cria uma proposta de auto-cura se aplicável.
   */
  public diagnoseAndHeal(failedTask: Task): SelfHealingDiagnosis | null {
    if (!failedTask.error) {
      return null;
    }

    this.logger.warn(`Diagnosticando falha para auto-cura na tarefa [${failedTask.id}]: ${failedTask.error.message}`);

    const errorMsg = failedTask.error.message;
    const isCompileOrTypeError =
      errorMsg.includes('error TS') ||
      errorMsg.includes('SyntaxError') ||
      errorMsg.includes('TypeError') ||
      errorMsg.includes('Cannot find module');

    const healingTitle = `[Self-Healing] Corrigir erro em: ${failedTask.title}`;
    const healingDescription = `A tarefa anterior falhou com a seguinte mensagem de erro:\n\n${errorMsg}\n\nDiagnóstico: ${
      isCompileOrTypeError ? 'Erro de compilação ou tipagem detectado' : 'Falha na execução de comando'
    }.\nAnalise os arquivos afetados, corrija a causa raiz do problema e assegure que o código compile sem erros.`;

    const healingDef: TaskDefinitionInput = {
      parentTaskId: failedTask.parentTaskId ?? failedTask.id,
      title: healingTitle,
      description: healingDescription,
      type: 'debugging',
      priority: 'critical',
      assignedAgent: failedTask.assignedAgent === 'codex' ? 'claude-code' : 'codex', // Alterna agente para nova perspectiva
      timeoutMs: 180_000,
      metadata: {
        isSelfHealing: true,
        originalTaskId: failedTask.id,
        originalError: failedTask.error,
      },
    };

    return {
      originalTaskId: failedTask.id,
      healingTaskDefinition: healingDef,
      reason: `Auto-cura acionada para erro: ${failedTask.error.code}`,
    };
  }
}
