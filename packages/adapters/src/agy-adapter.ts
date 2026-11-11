import { execSync } from 'node:child_process';
import { AgentMetadata } from '@coagent/protocol';
import { BaseCliAdapter, AdapterExecutionOptions } from './base-adapter.js';

export interface AgyAdapterOptions {
  displayName?: string;
  defaultModel?: string;
  executablePath?: string;
  maxConcurrency?: number;
}

export class AgyAdapter extends BaseCliAdapter {
  private readonly displayName: string;
  private readonly defaultModel?: string;
  private readonly maxConcurrency: number;

  constructor(id = 'agy', options?: AgyAdapterOptions) {
    super(id, 'agy', options?.executablePath ?? 'agy');
    this.displayName = options?.displayName ?? (id === 'agy' ? 'Google Antigravity (AGY)' : `Google Antigravity (${id})`);
    this.defaultModel = options?.defaultModel;
    this.maxConcurrency = options?.maxConcurrency ?? 2;
  }

  public getMetadata(): AgentMetadata {
    return {
      id: this.id,
      name: this.displayName,
      provider: this.provider,
      version: '1.5.5',
      description: 'Agente analítico de alto nível, raciocínio aprofundado, exploração de arquitetura e pesquisa',
      capabilities: {
        supportedTaskTypes: [
          'research',
          'architecture',
          'documentation',
          'code_review',
          'audit',
          'general',
        ],
        supportsStreaming: true,
        supportsSessions: true,
        supportsTools: true,
        supportsMcp: true,
        maxConcurrency: this.maxConcurrency,
        permissionLevels: ['read-only', 'workspace-write'],
        availableModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'claude-3-7-sonnet'],
      },
      status: 'idle',
      activeTasksCount: 0,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
    };
  }

  public async isAvailable(): Promise<boolean> {
    try {
      execSync(`${this.executablePath} --version`, {
        stdio: 'ignore',
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });
      return true;
    } catch {
      return false;
    }
  }

  protected buildCliArgs(options: AdapterExecutionOptions): string[] {
    const { task } = options;
    const args: string[] = ['-p'];

    const promptText = `[TAREFA DO COAGENT - ID: ${task.id}]\n\nTítulo: ${task.title}\nDescrição: ${task.description}\n\nExecute a solicitação com excelência técnica e responda com o resultado final.`;
    args.push(promptText);

    // Formato de saída JSON
    args.push('--output-format', 'json');

    // Modelo alvo: tarefa específica ou defaultModel da instância
    const targetModel = task.targetModel ?? this.defaultModel;
    if (targetModel) {
      args.push('--model', targetModel);
    }

    // Se a política de segurança permitir escrita ou bypass perigoso
    if (
      options.dangerouslySkipPermissions ||
      task.securityPolicy?.dangerouslySkipPermissions ||
      task.securityPolicy?.level === 'workspace-write' ||
      task.securityPolicy?.level === 'danger-full-access'
    ) {
      args.push('--dangerously-skip-permissions');
    }

    if (task.metadata['conversationId']) {
      args.push('--conversation', String(task.metadata['conversationId']));
    }

    return args;
  }
}
