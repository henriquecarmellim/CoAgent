import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createLogger, Logger } from '@coagent/shared';

export class ProjectMemoryManager {
  private readonly logger: Logger;
  private cachedMemory: string | null = null;
  private memoryPath: string | null = null;

  constructor(private readonly rootDir: string = process.cwd()) {
    this.logger = createLogger('core:project-memory');
  }

  /**
   * Localiza e lê o arquivo COAGENT.md mais próximo no workspace.
   */
  public loadMemory(): string {
    if (this.cachedMemory !== null) {
      return this.cachedMemory;
    }

    const possiblePaths = [
      join(this.rootDir, 'COAGENT.md'),
      join(this.rootDir, 'coagent.md'),
      join(this.rootDir, '.coagent', 'COAGENT.md'),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, 'utf-8');
          this.memoryPath = resolve(p);
          this.cachedMemory = content;
          this.logger.info(`Memória do projeto carregada com sucesso de: ${this.memoryPath}`);
          return content;
        } catch (err) {
          this.logger.warn(`Falha ao ler arquivo de memória em: ${p}`, { error: String(err) });
        }
      }
    }

    this.logger.debug('Nenhum arquivo COAGENT.md encontrado. Utilizando diretrizes padrão.');
    this.cachedMemory = '';
    return '';
  }

  /**
   * Formata a instrução com o contexto da memória para ser anexada ao prompt de qualquer agente.
   */
  public formatPromptContext(basePrompt: string): string {
    const memory = this.loadMemory();
    if (!memory.trim()) {
      return basePrompt;
    }

    return `### DIRETRIZES DO PROJETO (COAGENT.MD):\n${memory.trim()}\n\n---\n\n${basePrompt}`;
  }

  public getLoadedPath(): string | null {
    return this.memoryPath;
  }
}
