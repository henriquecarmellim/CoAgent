#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { bootstrapCoAgent } from '@coagent/orchestrator';
import { TaskType, TaskPriority } from '@coagent/protocol';

const coagent = bootstrapCoAgent();

const server = new Server(
  {
    name: 'coagent-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'coagent_list_agents',
        description: 'Lista todos os agentes registrados no CoAgent (AGY, Claude Code, Codex, OpenCode) e seus status atuais de concorrência.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'coagent_delegate_task',
        description: 'Delega uma tarefa individual para o CoAgent agendar, atribuir ao melhor agente e executar de forma assíncrona respeitando limites de concorrência.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título da tarefa' },
            description: { type: 'string', description: 'Instruções completas da tarefa' },
            type: {
              type: 'string',
              enum: ['research', 'architecture', 'implementation', 'testing', 'code_review', 'refactoring', 'audit', 'general'],
              description: 'Tipo de especialidade necessária para a tarefa',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'normal', 'low'],
              description: 'Prioridade na fila de execução',
            },
            agentId: {
              type: 'string',
              description: 'Opcional: ID de um agente específico (agy, claude-code, codex, opencode)',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'coagent_task_status',
        description: 'Consulta o status atual, logs e resultado final de uma tarefa do CoAgent por ID.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID da tarefa a ser consultada' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'coagent_cancel_task',
        description: 'Cancela imediatamente uma tarefa em execução ou na fila do CoAgent.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID da tarefa a ser cancelada' },
            reason: { type: 'string', description: 'Motivo do cancelamento' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'coagent_run_objective',
        description: 'Decompõe um objetivo complexo em um plano DAG de tarefas paralelas e orquestra a execução cooperativa entre os agentes disponíveis.',
        inputSchema: {
          type: 'object',
          properties: {
            objective: { type: 'string', description: 'Objetivo de alto nível a ser executado' },
          },
          required: ['objective'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'coagent_list_agents': {
        const agents = coagent.agentRegistry.listAgents();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                agents.map((a) => ({
                  id: a.id,
                  name: a.name,
                  provider: a.provider,
                  status: a.status,
                  activeTasks: a.activeTasksCount,
                  maxConcurrency: a.capabilities.maxConcurrency,
                  supportedTaskTypes: a.capabilities.supportedTaskTypes,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'coagent_delegate_task': {
        const title = String(args?.['title'] ?? '');
        const description = String(args?.['description'] ?? '');
        const type = (args?.['type'] as TaskType) ?? 'general';
        const priority = (args?.['priority'] as TaskPriority) ?? 'normal';
        const agentId = args?.['agentId'] ? String(args['agentId']) : undefined;

        const task = coagent.taskManager.createTask({
          title,
          description,
          type,
          priority,
          assignedAgent: agentId,
        });

        coagent.scheduler.submitTask(task);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Tarefa enfileirada com sucesso',
                  taskId: task.id,
                  status: task.status,
                  priority: task.priority,
                  assignedAgent: task.assignedAgent ?? 'auto',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'coagent_task_status': {
        const taskId = String(args?.['taskId'] ?? '');
        const task = coagent.taskManager.getTask(taskId);
        if (!task) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Tarefa com ID '${taskId}' não foi encontrada.` }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      }

      case 'coagent_cancel_task': {
        const taskId = String(args?.['taskId'] ?? '');
        const reason = String(args?.['reason'] ?? 'Cancelado via MCP');
        coagent.scheduler.cancelRunningTask(taskId, reason);
        return {
          content: [
            {
              type: 'text',
              text: `Cancelamento acionado para a tarefa ${taskId}.`,
            },
          ],
        };
      }

      case 'coagent_run_objective': {
        const objective = String(args?.['objective'] ?? '');
        const result = await coagent.orchestrator.executeObjective(objective);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: 'text', text: `Erro ao executar ferramenta ${name}: ${message}` }],
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((error) => {
  console.error('Falha fatal no CoAgent MCP Server:', error);
  process.exit(1);
});
