import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CoAgentInstance, bootstrapCoAgent } from '@coagent/orchestrator';
import { SystemEvent } from '@coagent/protocol';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function startDashboardServer(
  port = 3333,
  existingCoAgent?: CoAgentInstance
): Promise<void> {
  const coagent = existingCoAgent ?? bootstrapCoAgent();
  const fastify = Fastify({ logger: false });

  // Serve arquivos estáticos da UI
  const publicDir = join(__dirname, '..', 'public');
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  // REST: Status do Sistema
  fastify.get('/api/status', async () => {
    return coagent.orchestrator.getSystemStatus();
  });

  // REST: Listagem de Agentes
  fastify.get('/api/agents', async () => {
    return coagent.agentRegistry.listAgents();
  });

  // REST: Ligar / Desligar Agente (Toggle On/Off)
  fastify.post('/api/agents/:id/toggle', async (req) => {
    const params = req.params as { id: string };
    const body = (req.body ?? {}) as { enabled?: boolean };
    const enabled = coagent.agentRegistry.toggleAgent(params.id, body.enabled);
    return { success: true, agentId: params.id, enabled, status: enabled ? 'idle' : 'disabled' };
  });

  // REST: Configuração de Modelo do Agente
  fastify.post('/api/agents/:id/config', async (req) => {
    const params = req.params as { id: string };
    const body = req.body as { defaultModel?: string; maxConcurrency?: number };
    const agent = coagent.agentRegistry.getAgentOrThrow(params.id);
    if (body.maxConcurrency !== undefined) {
      agent.capabilities.maxConcurrency = body.maxConcurrency;
    }
    return { success: true, agent };
  });

  // REST: Listagem de Tarefas
  fastify.get('/api/tasks', async (req) => {
    const query = req.query as { limit?: string; status?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    let tasks = coagent.taskManager.listTasks(limit);
    if (query.status) {
      tasks = tasks.filter((t) => t.status === query.status);
    }
    return tasks;
  });

  // REST: Detalhe de Tarefa
  fastify.get('/api/tasks/:id', async (req, reply) => {
    const params = req.params as { id: string };
    const task = coagent.taskManager.getTask(params.id);
    if (!task) {
      reply.status(404);
      return { error: `Tarefa ${params.id} não encontrada` };
    }
    return task;
  });

  // REST: Criar Tarefa
  fastify.post('/api/tasks', async (req) => {
    const body = req.body as {
      title: string;
      description?: string;
      type?: string;
      priority?: string;
      agentId?: string;
      dangerouslySkipPermissions?: boolean;
    };

    const task = coagent.taskManager.createTask({
      title: body.title,
      description: body.description ?? '',
      type: (body.type as any) ?? 'general',
      priority: (body.priority as any) ?? 'normal',
      assignedAgent: body.agentId,
      securityPolicy: {
        dangerouslySkipPermissions: body.dangerouslySkipPermissions ?? false,
      },
    });

    coagent.scheduler.submitTask(task);
    return task;
  });

  // REST: Aprovar Tarefa
  fastify.post('/api/tasks/:id/approve', async (req) => {
    const params = req.params as { id: string };
    coagent.taskManager.transitionStatus(params.id, 'running');
    return { success: true, taskId: params.id, status: 'running' };
  });

  // REST: Rejeitar Tarefa
  fastify.post('/api/tasks/:id/reject', async (req) => {
    const params = req.params as { id: string };
    coagent.scheduler.cancelRunningTask(params.id, 'Rejeitado pelo usuário');
    return { success: true, taskId: params.id, status: 'cancelled' };
  });

  // REST: Cancelar Tarefa
  fastify.post('/api/tasks/:id/cancel', async (req) => {
    const params = req.params as { id: string };
    coagent.scheduler.cancelRunningTask(params.id, 'Cancelado via API');
    return { success: true, taskId: params.id, status: 'cancelled' };
  });

  // REST: Executar Objetivo Completo (Orquestração Multiagente)
  fastify.post('/api/objective', async (req) => {
    const body = req.body as {
      goal: string;
      exhaustUntilComplete?: boolean;
    };

    const result = await coagent.orchestrator.executeObjective(body.goal, {
      exhaustUntilComplete: body.exhaustUntilComplete ?? true,
    });
    return result;
  });

  // REST: CoAgent Advisor
  fastify.post('/api/advise', async (req) => {
    const body = req.body as { query: string; context?: string };
    const advice = await coagent.orchestrator.advisor.advise(body.query, body.context);
    return { advice };
  });

  // REST: CoAgent Review (Ultrareview)
  fastify.post('/api/review', async (req) => {
    const body = req.body as { diff: string };
    const review = coagent.orchestrator.advisor.reviewDiff(body.diff);
    return review;
  });

  // REST: Teste de Validação Rápida (Hello World)
  fastify.post('/api/test', async (req) => {
    const body = req.body as { agentId?: string };
    const targetAgents = body.agentId
      ? coagent.agentRegistry.listAgents().filter((a) => a.id === body.agentId)
      : coagent.agentRegistry.listAgents();

    const results: Array<{ agentId: string; name: string; success: boolean; output?: string; error?: string }> = [];

    for (const agent of targetAgents) {
      const testTask = coagent.taskManager.createTask({
        title: `Teste Hello World (${agent.id})`,
        description: 'Responda com HELLO_COAGENT_OK',
        type: 'general',
        priority: 'high',
        assignedAgent: agent.id,
        timeoutMs: 30_000,
        securityPolicy: { dangerouslySkipPermissions: true },
      });

      coagent.scheduler.submitTask(testTask);

      let attempts = 0;
      let finished = false;
      while (!finished && attempts < 50) {
        await new Promise((r) => setTimeout(r, 100));
        const current = coagent.taskManager.getTask(testTask.id);
        if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
          finished = true;
          results.push({
            agentId: agent.id,
            name: agent.name,
            success: current.status === 'completed',
            output: typeof current.result === 'string' ? current.result : JSON.stringify(current.result),
            error: current.error?.message,
          });
        }
        attempts++;
      }

      if (!finished) {
        results.push({
          agentId: agent.id,
          name: agent.name,
          success: false,
          error: 'Timeout aguardando execução',
        });
      }
    }

    return { results };
  });

  // SSE: Server-Sent Events para atualização em tempo real
  fastify.get('/api/events', async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    const sendEvent = (event: SystemEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = coagent.eventBus.on('*', sendEvent);

    req.raw.on('close', () => {
      unsubscribe();
    });
  });

  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`[Dashboard] CoAgent Web Dashboard ouvindo em http://localhost:${port}`);
}

// Se executado diretamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startDashboardServer().catch((err) => {
    console.error('Erro ao iniciar servidor do Dashboard:', err);
    process.exit(1);
  });
}
