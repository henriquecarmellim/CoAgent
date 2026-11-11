import { execSync } from 'node:child_process';
import { AgentMetadata } from '@coagent/protocol';
import { BaseCliAdapter, AdapterExecutionOptions } from './base-adapter.js';

export class AgyAdapter extends BaseCliAdapter {
  constructor(executablePath = 'agy') {
    super('agy', 'agy', executablePath);
  }

  public getMetadata(): AgentMetadata {
    return {
      id: this.id,
      name: 'Google Antigravity (AGY)',
      provider: 'agy',
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
        maxConcurrency: 2,
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

    // Modelo alvo caso especificado
    if (task.targetModel) {
      args.push('--model', task.targetModel);
    }

    // Se a política de segurança permitir escrita de workspace, bypass de confirmações para automação
    if (task.securityPolicy?.level === 'workspace-write' || task.securityPolicy?.level === 'danger-full-access') {
      args.push('--dangerously-skip-permissions');
    }

    // Sessão/Continuidade
    if (task.metadata['conversationId']) {
      args.push('--conversation', String(task.metadata['conversationId']));
    }

    return args;
  }
}
