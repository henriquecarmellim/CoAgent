import { AgentProvider } from '@coagent/protocol';

export type IntelligenceTier = 'max' | 'balanced' | 'fast';

export interface ModelTierConfig {
  tier: IntelligenceTier;
  models: Partial<Record<AgentProvider, string[]>>;
}

/**
 * Tabela de inteligência de modelos em ordem de raciocínio e profundidade.
 */
export const INTELLIGENCE_TIERS: Record<IntelligenceTier, Partial<Record<AgentProvider, string[]>>> = {
  max: {
    agy: ['gemini-2.5-pro', 'claude-3-7-sonnet'],
    'claude-code': ['claude-3-7-sonnet'],
    codex: ['o3', 'o4-mini'],
    opencode: ['anthropic/claude-3-7-sonnet', 'openai/gpt-4o'],
  },
  balanced: {
    agy: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    'claude-code': ['claude-3-5-haiku', 'claude-3-7-sonnet'],
    codex: ['o4-mini', 'gpt-4o'],
    opencode: ['deepseek/deepseek-chat', 'openai/gpt-4o-mini'],
  },
  fast: {
    agy: ['gemini-2.5-flash'],
    'claude-code': ['claude-3-5-haiku'],
    codex: ['o4-mini'],
    opencode: ['deepseek/deepseek-chat'],
  },
};

export class IntelligenceCascader {
  /**
   * Retorna o melhor modelo recomendado para um provedor dentro de um tier.
   */
  public static getRecommendedModel(provider: AgentProvider, tier: IntelligenceTier = 'max'): string | undefined {
    const list = INTELLIGENCE_TIERS[tier][provider];
    return list && list.length > 0 ? list[0] : undefined;
  }

  /**
   * Retorna o próximo modelo ou agente de fallback quando uma tentativa falha por quota, timeout ou rate limit.
   */
  public static getNextFallbackModel(
    provider: AgentProvider,
    currentModel?: string,
    currentTier: IntelligenceTier = 'max'
  ): { nextModel?: string; nextTier: IntelligenceTier } {
    const tierList = INTELLIGENCE_TIERS[currentTier][provider] ?? [];
    const currentIndex = currentModel ? tierList.indexOf(currentModel) : -1;

    // Se houver outro modelo no mesmo tier
    if (currentIndex !== -1 && currentIndex + 1 < tierList.length) {
      return {
        nextModel: tierList[currentIndex + 1],
        nextTier: currentTier,
      };
    }

    // Se esgotou os modelos do tier atual, faz fallback para o próximo tier
    if (currentTier === 'max') {
      const balancedList = INTELLIGENCE_TIERS.balanced[provider] ?? [];
      return {
        nextModel: balancedList[0],
        nextTier: 'balanced',
      };
    }

    if (currentTier === 'balanced') {
      const fastList = INTELLIGENCE_TIERS.fast[provider] ?? [];
      return {
        nextModel: fastList[0],
        nextTier: 'fast',
      };
    }

    return { nextModel: undefined, nextTier: 'fast' };
  }

  /**
   * Executa uma função/tarefa com tentativa em cascata automática:
   * Começa pelas IAs mais inteligentes (Tier Max) e faz fallback contínuo
   * se esgotar cota ou der erro, até zerar com sucesso.
   */
  public async executeWithCascade<T>(
    request: {
      title: string;
      description?: string;
      preferredAgent?: string;
      initialTier?: IntelligenceTier;
    },
    runner: (agentId: string, model?: string) => Promise<T>
  ): Promise<T> {
    const sequence: Array<{ agentId: string; model?: string; tier: IntelligenceTier }> = [
      // 1. Tier Max
      { agentId: request.preferredAgent ?? 'agy-1', model: 'gemini-2.5-pro', tier: 'max' },
      // 2. Tier Balanced / Instância rápida do Antigravity
      { agentId: 'agy-2', model: 'gemini-2.5-flash', tier: 'balanced' },
      // 3. Fallback para outros provedores disponíveis
      { agentId: 'claude-code', model: 'claude-3-7-sonnet', tier: 'max' },
      { agentId: 'codex', model: 'o3', tier: 'max' },
      { agentId: 'agy-2', model: 'gemini-2.5-flash', tier: 'fast' },
    ];

    let lastError: unknown;

    for (const step of sequence) {
      try {
        return await runner(step.agentId, step.model);
      } catch (err) {
        lastError = err;
        // Continua para o próximo agente/modelo na cascata
      }
    }

    throw lastError ?? new Error('Todas as alternativas de IA da cascata foram esgotadas.');
  }
}
