import { randomBytes } from 'node:crypto';

/**
 * Gera um ID único e seguro com prefixo para rastreamento visual.
 * Exemplo: generateId('task') -> 'task_7a8f9b2c3d4e'
 */
export function generateId(prefix: string): string {
  const bytes = randomBytes(8).toString('hex');
  return `${prefix}_${bytes}`;
}
