import { execSync } from 'node:child_process';
import { AgentMetadata } from '@coagent/protocol';
import { BaseCliAdapter, AdapterExecutionOptions } from './base-adapter.js';

export class CodexAdapter extends BaseCliAdapter {
  constructor(executablePath = 'codex') {
    super('codex', 'codex', executablePath);
  }

  public getMetadata(): AgentMetadata {
    return {
      id: this.id,
      name: 'OpenAI Codex CLI',
      provider: 'codex',
      version: '0.167.0',
      description: 'Especialista em geração de código algorítmico, revisão técnica, resolução de bugs e suítes de testes',
      capabilities: {
        supportedTaskTypes: [
          'implementation',
          'testing',
          'code_review',
          'debugging',
          'refactoring',
          'general',
        ],
        supportsStreaming: true,
        supportsSessions: true,
        supportsTools: true,
        supportsMcp: true,
        maxConcurrency: 2,
        permissionLevels: ['read-only', 'workspace-write'],
        availableModels: ['o3', 'o4-mini', 'gpt-4o'],
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
    const args: string[] = ['exec'];

    const promptText = `[TAREFA DO COAGENT - ID: ${task.id}]\n\nTítulo: ${task.title}\nDescrição: ${task.description}\n\nExecute a solicitação com precisão e retorne o resultado.`;
    args.push(promptText);

    args.push('--json');

    if (task.targetModel) {
      args.push('-m', task.targetModel);
    }

    if (options.dangerouslySkipPermissions || task.securityPolicy?.dangerouslySkipPermissions) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else if (task.securityPolicy?.level === 'read-only') {
      args.push('-s', 'read-only');
    } else if (task.securityPolicy?.level === 'workspace-write') {
      args.push('-s', 'workspace-write');
      args.push('--approve-for-me');
    } else if (task.securityPolicy?.level === 'danger-full-access') {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }

    return args;
  }
}
