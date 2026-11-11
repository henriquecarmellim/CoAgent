import { execSync } from 'node:child_process';
import { AgentMetadata } from '@coagent/protocol';
import { BaseCliAdapter, AdapterExecutionOptions } from './base-adapter.js';

export interface OpenCodeAdapterOptions {
  displayName?: string;
  defaultModel?: string;
  executablePath?: string;
  maxConcurrency?: number;
}

export class OpenCodeAdapter extends BaseCliAdapter {
  private readonly displayName: string;
  private readonly defaultModel?: string;
  private readonly maxConcurrency: number;

  constructor(id = 'opencode', options?: OpenCodeAdapterOptions) {
    super(id, 'opencode', options?.executablePath ?? 'opencode');
    this.displayName = options?.displayName ?? (id === 'opencode' ? 'OpenCode CLI' : `OpenCode (${id})`);
    this.defaultModel = options?.defaultModel;
    this.maxConcurrency = options?.maxConcurrency ?? 2;
  }

  public getMetadata(): AgentMetadata {
    return {
      id: this.id,
      name: this.displayName,
      provider: this.provider,
      version: '1.19.0',
      description: 'Plataforma multi-provedor aberta com suporte a diversos modelos locais e remotos, auditoria e execução',
      capabilities: {
        supportedTaskTypes: [
          'implementation',
          'refactoring',
          'audit',
          'documentation',
          'testing',
          'code_review',
          'general',
        ],
        supportsStreaming: true,
        supportsSessions: true,
        supportsTools: true,
        supportsMcp: true,
        maxConcurrency: this.maxConcurrency,
        permissionLevels: ['read-only', 'workspace-write'],
        availableModels: ['anthropic/claude-3-7-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-chat'],
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
    const args: string[] = ['run'];

    const promptText = `[TAREFA DO COAGENT - ID: ${task.id}]\n\nTítulo: ${task.title}\nDescrição: ${task.description}\n\nExecute a solicitação e retorne o resultado.`;
    args.push(promptText);

    args.push('--format', 'json');

    const targetModel = task.targetModel ?? this.defaultModel;
    if (targetModel) {
      args.push('-m', targetModel);
    }

    if (
      options.dangerouslySkipPermissions ||
      task.securityPolicy?.dangerouslySkipPermissions ||
      task.securityPolicy?.level === 'workspace-write' ||
      task.securityPolicy?.level === 'danger-full-access'
    ) {
      args.push('--auto');
    }

    if (task.metadata['sessionId']) {
      args.push('--session', String(task.metadata['sessionId']));
    }

    return args;
  }
}
