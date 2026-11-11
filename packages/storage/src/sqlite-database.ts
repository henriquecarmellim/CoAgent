import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger, Logger, CoAgentError } from '@coagent/shared';
import { INITIAL_SCHEMA_SQL } from './schema.js';

export interface DatabaseConfig {
  filename: string;
  enableWal?: boolean;
}

export class SQLiteDatabase {
  private db: DatabaseSync | null = null;
  private readonly config: DatabaseConfig;
  private readonly logger: Logger;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.logger = createLogger('storage:sqlite');
  }

  public connect(): void {
    if (this.db) {
      return;
    }

    try {
      if (this.config.filename !== ':memory:') {
        const dir = dirname(this.config.filename);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }

      this.db = new DatabaseSync(this.config.filename);

      if (this.config.enableWal !== false && this.config.filename !== ':memory:') {
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA synchronous = NORMAL;');
      }
      this.db.exec('PRAGMA foreign_keys = ON;');

      this.runMigrations();
      this.logger.info(`Conexão com SQLite iniciada com sucesso em: ${this.config.filename}`);
    } catch (error) {
      this.logger.error('Falha ao conectar no banco de dados SQLite', error);
      throw new CoAgentError('STORAGE_ERROR', 'Não foi possível inicializar banco SQLite', error);
    }
  }

  private runMigrations(): void {
    if (!this.db) {
      throw new CoAgentError('STORAGE_ERROR', 'Banco de dados não está conectado');
    }

    this.db.exec(INITIAL_SCHEMA_SQL);
  }

  public getRawDb(): DatabaseSync {
    if (!this.db) {
      this.connect();
    }
    return this.db!;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.info('Conexão com SQLite encerrada com sucesso.');
    }
  }
}
