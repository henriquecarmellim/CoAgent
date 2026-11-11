/**
 * Códigos de erro padronizados do framework CoAgent.
 */
export type CoAgentErrorCode =
  | 'AGENT_NOT_FOUND'
  | 'AGENT_UNAVAILABLE'
  | 'AGENT_EXECUTION_FAILED'
  | 'TASK_NOT_FOUND'
  | 'TASK_TIMEOUT'
  | 'TASK_CANCELLED'
  | 'TASK_DEPENDENCY_CYCLE'
  | 'TASK_INVALID_STATE_TRANSITION'
  | 'CONCURRENCY_LIMIT_REACHED'
  | 'PERMISSION_DENIED'
  | 'INVALID_MESSAGE'
  | 'STORAGE_ERROR'
  | 'VALIDATION_ERROR'
  | 'CONFIG_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Classe base para todos os erros controlados do CoAgent.
 */
export class CoAgentError extends Error {
  public readonly code: CoAgentErrorCode;
  public readonly details?: unknown;
  public readonly timestamp: string;

  constructor(code: CoAgentErrorCode, message: string, details?: unknown) {
    super(`[${code}] ${message}`);
    this.name = 'CoAgentError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}
