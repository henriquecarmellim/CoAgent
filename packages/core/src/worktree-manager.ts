import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger, Logger } from '@coagent/shared';

export interface WorktreeSession {
  taskId: string;
  branchName: string;
  worktreePath: string;
}

export class WorktreeManager {
  private readonly logger: Logger;
  private readonly worktreesDir: string;
  private isGitRepoCache: boolean | null = null;

  constructor(private readonly baseDir: string = process.cwd()) {
    this.logger = createLogger('core:worktree-manager');
    this.worktreesDir = resolve(this.baseDir, '.coagent', 'worktrees');
  }

  public isGitRepository(): boolean {
    if (this.isGitRepoCache !== null) {
      return this.isGitRepoCache;
    }
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.baseDir,
        stdio: 'ignore',
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });
      this.isGitRepoCache = true;
    } catch {
      this.isGitRepoCache = false;
    }
    return this.isGitRepoCache;
  }

  /**
   * Cria uma nova Git Worktree isolada para a tarefa.
   */
  public createWorktree(taskId: string): WorktreeSession | null {
    if (!this.isGitRepository()) {
      this.logger.debug('Diretório não é um repositório Git. Worktree ignorada.');
      return null;
    }

    try {
      if (!existsSync(this.worktreesDir)) {
        mkdirSync(this.worktreesDir, { recursive: true });
      }

      const branchName = `coagent/${taskId}`;
      const worktreePath = resolve(this.worktreesDir, taskId);

      // Limpa worktree anterior se existir
      if (existsSync(worktreePath)) {
        this.removeWorktree(taskId);
      }

      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      // Cria worktree baseada no HEAD atual com nova branch temporária
      execSync(`git worktree add -B ${branchName} "${worktreePath}" HEAD`, {
        cwd: this.baseDir,
        stdio: 'pipe',
        shell,
      });

      this.logger.info(`Worktree isolada criada com sucesso para [${taskId}] em: ${worktreePath}`);

      return {
        taskId,
        branchName,
        worktreePath,
      };
    } catch (err) {
      this.logger.warn(`Não foi possível criar Git worktree para tarefa ${taskId}`, { error: String(err) });
      return null;
    }
  }

  /**
   * Realiza merge das alterações da worktree na branch principal do workspace.
   */
  public mergeWorktree(session: WorktreeSession): boolean {
    if (!this.isGitRepository()) return false;

    try {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';

      // Verifica se houve commits na worktree
      const status = execSync('git status --porcelain', {
        cwd: session.worktreePath,
        encoding: 'utf-8',
        shell,
      });

      if (status.trim()) {
        execSync('git add . && git commit -m "coagent: auto-commit task changes"', {
          cwd: session.worktreePath,
          shell,
        });
      }

      // Faz merge no workspace principal
      execSync(`git merge --no-ff -m "coagent: merge task ${session.taskId}" ${session.branchName}`, {
        cwd: this.baseDir,
        shell,
      });

      this.logger.info(`Alterações da worktree [${session.taskId}] mescladas com sucesso.`);
      return true;
    } catch (err) {
      this.logger.error(`Conflito ou falha ao mesclar worktree [${session.taskId}]`, err);
      return false;
    }
  }

  /**
   * Remove a worktree e desaloca o diretório de forma segura.
   */
  public removeWorktree(taskId: string): void {
    if (!this.isGitRepository()) return;

    try {
      const worktreePath = resolve(this.worktreesDir, taskId);
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';

      execSync(`git worktree remove --force "${worktreePath}"`, {
        cwd: this.baseDir,
        stdio: 'ignore',
        shell,
      });

      if (existsSync(worktreePath)) {
        rmSync(worktreePath, { recursive: true, force: true });
      }

      this.logger.debug(`Worktree [${taskId}] removida com sucesso.`);
    } catch {
      // Ignora erro se já tiver sido removida
    }
  }
}
