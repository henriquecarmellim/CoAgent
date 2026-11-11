import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bootstrapCoAgent } from '@coagent/orchestrator';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export async function startDashboardServer(port = 3333, existingCoAgent) {
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
        const query = req.query;
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        let tasks = coagent.taskManager.listTasks(limit);
        if (query.status) {
            tasks = tasks.filter((t) => t.status === query.status);
        }
        return tasks;
    });
    // REST: Criar Tarefa
    fastify.post('/api/tasks', async (req) => {
        const body = req.body;
        const task = coagent.taskManager.createTask({
            title: body.title,
            description: body.description ?? '',
            type: body.type ?? 'general',
            priority: body.priority ?? 'normal',
            assignedAgent: body.agentId,
        });
        coagent.scheduler.submitTask(task);
        return task;
    });
    // SSE: Server-Sent Events para atualização em tempo real
    fastify.get('/api/events', async (req, reply) => {
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('Access-Control-Allow-Origin', '*');
        reply.raw.flushHeaders();
        const sendEvent = (event) => {
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
//# sourceMappingURL=server.js.map