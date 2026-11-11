import { ChildProcess, spawn } from 'node:child_process';
import { AgentMetadata, AgentProvider, Task } from '@coagent/protocol';
import { createLogger, Logger, CoAgentError } from '@coagent/shared';

export interface AdapterExecutionOptions {
  task: Task;
  signal?: AbortSignal;
  workingDirectory?: string;
  dangerouslySkipPermissions?: boolean;
  onChunk?: (chunk: string) => void;
  onProgress?: (progressPercent: number, stage: string) => void;
}

export interface AdapterExecutionResult {
  output: string;
  rawJson?: unknown;
  exitCode: number;
  durationMs: number;
}

/**
 * Interface padronizada para adaptadores de agentes no CoAgent.
 */
export interface AgentAdapter {
  readonly id: string;
  readonly provider: AgentProvider;
  getMetadata(): AgentMetadata;
  isAvailable(): Promise<boolean>;
  execute(options: AdapterExecutionOptions): Promise<AdapterExecutionResult>;
}

/**
 * Classe base abstrata para adaptadores de CLI.
 */
export abstract class BaseCliAdapter implements AgentAdapter {
  protected readonly logger: Logger;
  protected activeProcess: ChildProcess | null = null;

  constructor(
    public readonly id: string,
    public readonly provider: AgentProvider,
    protected readonly executablePath: string
  ) {
    this.logger = createLogger(`adapter:${id}`);
  }

  public abstract getMetadata(): AgentMetadata;
  public abstract isAvailable(): Promise<boolean>;
  protected abstract buildCliArgs(options: AdapterExecutionOptions): string[];

  public async execute(options: AdapterExecutionOptions): Promise<AdapterExecutionResult> {
    const startTime = Date.now();
    const args = this.buildCliArgs(options);
    const cwd = options.workingDirectory ?? process.cwd();

    this.logger.info(`Iniciando execução do agente [${this.id}] no diretório: ${cwd}`, {
      executable: this.executablePath,
      argsCount: args.length,
    });

    return new Promise<AdapterExecutionResult>((resolve, reject) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Configura spawn no Windows
      const isWindows = process.platform === 'win32';
      const child = spawn(this.executablePath, args, {
        cwd,
        shell: isWindows,
        env: {
          ...process.env,
          COAGENT_TASK_ID: options.task.id,
          COAGENT_AGENT_ID: this.id,
        },
      });

      this.activeProcess = child;

      const abortHandler = () => {
        this.logger.warn(`Sinal de cancelamento recebido para o processo do agente [${this.id}]`);
        try {
          if (isWindows && child.pid) {
            // No Windows, encerra a árvore do processo com taskkill
            spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
          } else {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) child.kill('SIGKILL');
            }, 3000);
          }
        } catch (err) {
          this.logger.error(`Erro ao encerrar processo do agente [${this.id}]`, err);
        }
      };

      if (options.signal) {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }

      child.stdout?.on('data', (data: Buffer) => {
        const str = data.toString('utf-8');
        stdoutBuffer += str;
        if (options.onChunk) {
          options.onChunk(str);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const str = data.toString('utf-8');
        stderrBuffer += str;
      });

      child.on('error', (err) => {
        this.activeProcess = null;
        if (options.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }
        reject(
          new CoAgentError(
            'AGENT_EXECUTION_FAILED',
            `Falha ao iniciar processo do agente ${this.id}: ${err.message}`,
            err
          )
        );
      });

      child.on('close', (code) => {
        this.activeProcess = null;
        if (options.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }

        const durationMs = Date.now() - startTime;
        const exitCode = code ?? 0;

        if (options.signal?.aborted) {
          reject(new CoAgentError('TASK_CANCELLED', `Execução do agente ${this.id} cancelada`));
          return;
        }

        if (exitCode !== 0) {
          this.logger.error(`Agente ${this.id} encerrou com código de erro ${exitCode}`, undefined, {
            stderr: stderrBuffer.slice(-1000),
          });
          reject(
            new CoAgentError(
              'AGENT_EXECUTION_FAILED',
              `Agente ${this.id} falhou com código ${exitCode}: ${stderrBuffer || stdoutBuffer}`,
              { exitCode, stdout: stdoutBuffer, stderr: stderrBuffer }
            )
          );
          return;
        }

        this.logger.info(`Execução do agente [${this.id}] concluída com sucesso em ${durationMs}ms`);

        let rawJson: unknown = undefined;
        try {
          rawJson = JSON.parse(stdoutBuffer.trim());
        } catch {
          // Output pode ser texto puro ou JSONL
        }

        resolve({
          output: stdoutBuffer,
          rawJson,
          exitCode,
          durationMs,
        });
      });
    });
  }
}
