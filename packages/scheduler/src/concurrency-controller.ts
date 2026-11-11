import { AgentProvider } from '@coagent/protocol';
import { createLogger, Deferred, Logger } from '@coagent/shared';

export interface ConcurrencyConfig {
  maxGlobalParallelism: number; // Padrão: 4
  maxPerProvider: Partial<Record<AgentProvider, number>>;
}

export class ConcurrencyController {
  private activeGlobalCount = 0;
  private readonly activePerProvider = new Map<string, number>();
  private readonly waiters: Array<{
    provider?: string;
    deferred: Deferred<() => void>;
  }> = [];
  private readonly config: ConcurrencyConfig;
  private readonly logger: Logger;

  constructor(config?: Partial<ConcurrencyConfig>) {
    this.config = {
      maxGlobalParallelism: config?.maxGlobalParallelism ?? 4,
      maxPerProvider: config?.maxPerProvider ?? {
        'agy': 2,
        'claude-code': 2,
        'codex': 2,
        'opencode': 2,
      },
    };
    this.logger = createLogger('scheduler:concurrency');
  }

  public get activeGlobal(): number {
    return this.activeGlobalCount;
  }

  public get maxGlobal(): number {
    return this.config.maxGlobalParallelism;
  }

  public getActiveForProvider(provider: string): number {
    return this.activePerProvider.get(provider) ?? 0;
  }

  public canAcquire(provider?: string): boolean {
    if (this.activeGlobalCount >= this.config.maxGlobalParallelism) {
      return false;
    }

    if (provider) {
      const providerLimit = this.config.maxPerProvider[provider as AgentProvider];
      if (providerLimit !== undefined) {
        const activeForProvider = this.getActiveForProvider(provider);
        if (activeForProvider >= providerLimit) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Adquire um slot de execução. Retorna uma função `release` que deve ser chamada no finally.
   */
  public async acquire(provider?: string): Promise<() => void> {
    if (this.canAcquire(provider)) {
      return this.grantSlot(provider);
    }

    this.logger.debug(
      `Limite de concorrência atingido (Global: ${this.activeGlobalCount}/${this.config.maxGlobalParallelism}). Enfileirando espera.`
    );

    const deferred = new Deferred<() => void>();
    this.waiters.push({ provider, deferred });

    return deferred.promise;
  }

  private grantSlot(provider?: string): () => void {
    this.activeGlobalCount += 1;
    if (provider) {
      const current = this.getActiveForProvider(provider);
      this.activePerProvider.set(provider, current + 1);
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;

      this.activeGlobalCount = Math.max(0, this.activeGlobalCount - 1);
      if (provider) {
        const current = this.getActiveForProvider(provider);
        this.activePerProvider.set(provider, Math.max(0, current - 1));
      }

      this.processNextWaiter();
    };
  }

  private processNextWaiter(): void {
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i];
      if (!waiter) continue;

      if (this.canAcquire(waiter.provider)) {
        this.waiters.splice(i, 1);
        const releaseFn = this.grantSlot(waiter.provider);
        waiter.deferred.resolve(releaseFn);
        return;
      }
    }
  }

  public setMaxGlobalParallelism(newMax: number): void {
    this.config.maxGlobalParallelism = Math.max(1, newMax);
    this.logger.info(`Limite global de concorrência alterado para: ${newMax}`);
    this.processNextWaiter();
  }
}
