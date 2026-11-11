import { CoAgentError } from './errors.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operação excedeu o tempo limite'
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new CoAgentError('TASK_TIMEOUT', `${errorMessage} (${timeoutMs}ms)`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  onRetry?: (error: unknown, attempt: number) => void;
  shouldRetry?: (error: unknown) => boolean;
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxRetries,
    initialDelayMs = 250,
    backoffFactor = 2,
    onRetry,
    shouldRetry = () => true,
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (error) {
      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }
      if (onRetry) {
        onRetry(error, attempt);
      }
      await sleep(delay);
      delay *= backoffFactor;
    }
  }
}

/**
 * Cria uma Promise diferida (deferred) para controle fino de resolução e rejeição.
 */
export class Deferred<T> {
  public readonly promise: Promise<T>;
  public resolve!: (value: T | PromiseLike<T>) => void;
  public reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}
