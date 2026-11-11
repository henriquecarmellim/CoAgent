import { execSync } from 'node:child_process';
import { AgentMetadata } from '@coagent/protocol';
import { BaseCliAdapter, AdapterExecutionOptions } from './base-adapter.js';

export class OpenCodeAdapter extends BaseCliAdapter {
  constructor(executablePath = 'opencode') {
    super('opencode', 'opencode', executablePath);
  }

  public getMetadata(): AgentMetadata {
    return {
      id: this.id,
      name: 'OpenCode CLI',
      provider: 'opencode',
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
        maxConcurrency: 2,
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

    if (task.targetModel) {
      args.push('-m', task.targetModel);
    }

    if (task.securityPolicy?.level === 'workspace-write' || task.securityPolicy?.level === 'danger-full-access') {
      args.push('--auto');
    }

    if (task.metadata['sessionId']) {
      args.push('--session', String(task.metadata['sessionId']));
    }

    return args;
  }
}
