import { resolve, normalize } from 'node:path';
import { SecurityPolicy, PermissionLevel } from '@coagent/protocol';
import { CoAgentError, createLogger, Logger } from '@coagent/shared';
import { EventBus } from './event-bus.js';

export interface PermissionCheckRequest {
  taskId?: string;
  agentId?: string;
  command?: string;
  targetPath?: string;
  isDestructive?: boolean;
  [key: string]: unknown;
}

export interface PermissionCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export class PermissionManager {
  private readonly defaultPolicy: SecurityPolicy;
  private readonly logger: Logger;

  constructor(defaultPolicy?: Partial<SecurityPolicy>, private readonly eventBus?: EventBus) {
    this.defaultPolicy = {
      level: defaultPolicy?.level ?? 'workspace-write',
      allowedDirectories: (defaultPolicy?.allowedDirectories ?? [process.cwd()]).map((d) => normalize(resolve(d))),
      blockedCommands: defaultPolicy?.blockedCommands ?? [
        'rm -rf /',
        'rmdir /s /q c:\\',
        'format',
        'mkfs',
        'dd',
        'shutdown',
        'drop table',
      ],
      allowTerminalExecution: defaultPolicy?.allowTerminalExecution ?? true,
      requireApprovalForDestructive: defaultPolicy?.requireApprovalForDestructive ?? true,
    };
    this.logger = createLogger('core:permission-manager');
  }

  public checkPathAccess(targetPath: string, policy?: SecurityPolicy): boolean {
    const activePolicy = policy ?? this.defaultPolicy;
    const normalizedTarget = normalize(resolve(targetPath));

    if (activePolicy.allowedDirectories.length === 0) {
      return true;
    }

    return activePolicy.allowedDirectories.some((allowedDir) => {
      const normalizedAllowed = normalize(resolve(allowedDir));
      return (
        normalizedTarget === normalizedAllowed ||
        normalizedTarget.startsWith(normalizedAllowed.endsWith('\\') || normalizedAllowed.endsWith('/') ? normalizedAllowed : `${normalizedAllowed}\\`)
      );
    });
  }

  public checkCommand(
    request: PermissionCheckRequest,
    policy?: SecurityPolicy
  ): PermissionCheckResult {
    const activePolicy = policy ?? this.defaultPolicy;

    // Se estiver em modo read-only e tentar executar comandos destrutivos ou terminal
    if (activePolicy.level === 'read-only' && request.command) {
      this.logger.warn(`Execução de comando bloqueada pelo modo 'read-only'`, request);
      this.eventBus?.emitEvent(
        'security:violation_attempt',
        { reason: 'read-only mode blocked command', ...request },
        { taskId: request.taskId, agentId: request.agentId }
      );
      return {
        allowed: false,
        requiresApproval: false,
        reason: "O modo de segurança 'read-only' impede a execução de comandos.",
      };
    }

    // Se o terminal estiver explicitamente desabilitado
    if (!activePolicy.allowTerminalExecution && request.command) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: 'Execução de terminal não autorizada pela política de segurança.',
      };
    }

    // Checagem de comandos bloqueados
    if (request.command) {
      const lowerCmd = request.command.toLowerCase();
      for (const blocked of activePolicy.blockedCommands) {
        if (lowerCmd.includes(blocked.toLowerCase())) {
          this.logger.error(`Tentativa de comando destrutivo bloqueado: "${request.command}"`, undefined, request);
          this.eventBus?.emitEvent(
            'security:violation_attempt',
            { reason: 'blocked command signature match', command: request.command },
            { taskId: request.taskId, agentId: request.agentId }
          );
          return {
            allowed: false,
            requiresApproval: false,
            reason: `Comando contém instrução proibida: '${blocked}'.`,
          };
        }
      }
    }

    // Checagem de caminho de arquivo
    if (request.targetPath && !this.checkPathAccess(request.targetPath, activePolicy)) {
      this.logger.warn(`Acesso ao caminho '${request.targetPath}' fora do workspace permitido.`);
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Caminho '${request.targetPath}' não está na lista de diretórios autorizados.`,
      };
    }

    // Exigência de aprovação para operações destrutivas
    if (request.isDestructive && activePolicy.requireApprovalForDestructive) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Operação destrutiva requer aprovação explícita do usuário.',
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
    };
  }

  public assertAllowed(request: PermissionCheckRequest, policy?: SecurityPolicy): void {
    const result = this.checkCommand(request, policy);
    if (!result.allowed) {
      throw new CoAgentError(
        'PERMISSION_DENIED',
        result.reason ?? 'Operação negada pela política de segurança'
      );
    }
  }

  public getPolicyForLevel(level: PermissionLevel): SecurityPolicy {
    switch (level) {
      case 'read-only':
        return {
          ...this.defaultPolicy,
          level: 'read-only',
          allowTerminalExecution: false,
          requireApprovalForDestructive: true,
        };
      case 'workspace-write':
        return {
          ...this.defaultPolicy,
          level: 'workspace-write',
          allowTerminalExecution: true,
          requireApprovalForDestructive: true,
        };
      case 'danger-full-access':
        return {
          ...this.defaultPolicy,
          level: 'danger-full-access',
          allowTerminalExecution: true,
          requireApprovalForDestructive: false,
        };
    }
  }
}
