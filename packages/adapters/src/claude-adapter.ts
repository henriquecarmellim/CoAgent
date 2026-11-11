import { execSync } from 'node:child_process';
import { AgentMetadata } from '@coagent/protocol';
import { BaseCliAdapter, AdapterExecutionOptions } from './base-adapter.js';

export class ClaudeCodeAdapter extends BaseCliAdapter {
  constructor(executablePath = 'claude') {
    super('claude-code', 'claude-code', executablePath);
  }

  public getMetadata(): AgentMetadata {
    return {
      id: this.id,
      name: 'Claude Code CLI',
      provider: 'claude-code',
      version: '2.1.322',
      description: 'Especialista em implementação de software, refatoração de código, testes e Git workflows',
      capabilities: {
        supportedTaskTypes: [
          'implementation',
          'refactoring',
          'debugging',
          'testing',
          'code_review',
          'architecture',
          'general',
        ],
        supportsStreaming: true,
        supportsSessions: true,
        supportsTools: true,
        supportsMcp: true,
        maxConcurrency: 2,
        permissionLevels: ['read-only', 'workspace-write'],
        availableModels: ['claude-3-7-sonnet', 'claude-3-5-haiku'],
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

    args.push('--output-format', 'json');

    if (task.targetModel) {
      args.push('--model', task.targetModel);
    }

    if (task.securityPolicy?.level === 'workspace-write' || task.securityPolicy?.level === 'danger-full-access') {
      args.push('--dangerously-skip-permissions');
    }

    if (task.metadata['sessionId']) {
      args.push('--resume', String(task.metadata['sessionId']));
    }

    return args;
  }
}
