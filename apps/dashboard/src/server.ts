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

  // REST: Criar Tarefa
  fastify.post('/api/tasks', async (req) => {
    const body = req.body as {
      title: string;
      description?: string;
      type?: string;
      priority?: string;
      agentId?: string;
    };

    const task = coagent.taskManager.createTask({
      title: body.title,
      description: body.description ?? '',
      type: (body.type as any) ?? 'general',
      priority: (body.priority as any) ?? 'normal',
      assignedAgent: body.agentId,
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
    coagent.scheduler.cancelRunningTask(params.id, 'Rejeitado pelo usuário via Dashboard');
    return { success: true, taskId: params.id, status: 'cancelled' };
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
