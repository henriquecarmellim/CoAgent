#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { bootstrapCoAgent } from '@coagent/orchestrator';
import { TaskPriority, TaskType } from '@coagent/protocol';

const program = new Command();
const coagent = bootstrapCoAgent();

program
  .name('coagent')
  .description(chalk.bold.cyan('CoAgent — Framework de Orquestração Multiagente de IA'))
  .version('1.0.0');

// ==========================================
// Subcomando: AGENTS
// ==========================================
const agentsCmd = program.command('agents').description('Gerenciamento e monitoramento de agentes');

agentsCmd
  .command('list')
  .description('Lista todos os agentes registrados e suas capacidades')
  .action(() => {
    const agents = coagent.agentRegistry.listAgents();

    console.log(chalk.bold(`\n🤖 Agentes Registrados no CoAgent (${agents.length}):\n`));

    const table = new Table({
      head: [
        chalk.cyan('ID'),
        chalk.cyan('Nome'),
        chalk.cyan('Provedor'),
        chalk.cyan('Status'),
        chalk.cyan('Concorrência Máx'),
        chalk.cyan('Tipos Suportados'),
      ],
      colWidths: [15, 24, 14, 12, 18, 30],
      wordWrap: true,
    });

    for (const a of agents) {
      const statusColor =
        a.status === 'idle'
          ? chalk.green(a.status)
          : a.status === 'busy'
          ? chalk.yellow(a.status)
          : chalk.red(a.status);

      table.push([
        a.id,
        a.name,
        a.provider,
        statusColor,
        `${a.activeTasksCount}/${a.capabilities.maxConcurrency}`,
        a.capabilities.supportedTaskTypes.join(', '),
      ]);
    }

    console.log(table.toString());
    console.log('');
  });

agentsCmd
  .command('status')
  .description('Exibe status em tempo real da capacidade de execução dos agentes')
  .action(() => {
    const status = coagent.orchestrator.getSystemStatus();
    console.log(chalk.bold('\n📊 Status de Execução em Tempo Real:\n'));
    console.log(`• Slots Globais de Execução: ${chalk.cyan(status.concurrency.active)} / ${chalk.cyan(status.concurrency.max)}`);
    console.log(`• Tarefas em Execução: ${chalk.yellow(status.activeTasks.length)}`);
    console.log(`• Tarefas Aguardando na Fila: ${chalk.blue(status.queuedTasks.length)}\n`);

    const table = new Table({
      head: [
        chalk.cyan('Agente'),
        chalk.cyan('Estado'),
        chalk.cyan('Tarefas Ativas'),
        chalk.cyan('Total Concluídas'),
        chalk.cyan('Total Falhas'),
      ],
    });

    for (const a of status.agents) {
      table.push([
        a.name,
        a.status === 'idle' ? chalk.green(a.status) : chalk.yellow(a.status),
        a.activeTasksCount,
        chalk.green(a.totalTasksCompleted),
        chalk.red(a.totalTasksFailed),
      ]);
    }

    console.log(table.toString());
    console.log('');
  });

// ==========================================
// Subcomando: TASK
// ==========================================
const taskCmd = program.command('task').description('Criação, inspeção e controle de tarefas');

taskCmd
  .command('create <title>')
  .description('Cria e enfileira uma nova tarefa no CoAgent')
  .option('-t, --type <type>', 'Tipo de tarefa (implementation, research, testing, code_review, audit, etc.)', 'general')
  .option('-p, --priority <priority>', 'Prioridade (critical, high, normal, low)', 'normal')
  .option('-a, --agent <agentId>', 'ID do agente específico para execução')
  .option('-d, --desc <description>', 'Descrição detalhada da tarefa', '')
  .action((title, options) => {
    const task = coagent.taskManager.createTask({
      title,
      description: options.desc,
      type: options.type as TaskType,
      priority: options.priority as TaskPriority,
      assignedAgent: options.agent,
    });

    coagent.scheduler.submitTask(task);

    console.log(chalk.green(`\n✓ Tarefa criada com sucesso!`));
    console.log(`• ID: ${chalk.bold.cyan(task.id)}`);
    console.log(`• Título: ${task.title}`);
    console.log(`• Prioridade: ${chalk.yellow(task.priority)}`);
    console.log(`• Agente Atribuído: ${task.assignedAgent ?? 'Seleção Automática (SmartDelegator)'}\n`);
  });

taskCmd
  .command('list')
  .description('Lista as tarefas cadastradas no sistema')
  .option('-s, --status <status>', 'Filtrar por status (pending, queued, running, completed, failed, cancelled)')
  .option('-l, --limit <limit>', 'Limite de tarefas exibidas', '25')
  .action((options) => {
    let tasks = coagent.taskManager.listTasks(parseInt(options.limit, 10));
    if (options.status) {
      tasks = tasks.filter((t) => t.status === options.status);
    }

    console.log(chalk.bold(`\n📋 Tarefas no CoAgent (${tasks.length}):\n`));

    const table = new Table({
      head: [
        chalk.cyan('ID'),
        chalk.cyan('Título'),
        chalk.cyan('Tipo'),
        chalk.cyan('Status'),
        chalk.cyan('Prioridade'),
        chalk.cyan('Agente'),
        chalk.cyan('Criado em'),
      ],
      colWidths: [22, 30, 16, 14, 12, 14, 22],
      wordWrap: true,
    });

    for (const t of tasks) {
      const statusColor =
        t.status === 'completed'
          ? chalk.green(t.status)
          : t.status === 'running'
          ? chalk.yellow(t.status)
          : t.status === 'failed'
          ? chalk.red(t.status)
          : t.status === 'cancelled'
          ? chalk.gray(t.status)
          : chalk.blue(t.status);

      table.push([
        t.id,
        t.title,
        t.type,
        statusColor,
        t.priority,
        t.assignedAgent ?? 'auto',
        new Date(t.createdAt).toLocaleTimeString(),
      ]);
    }

    console.log(table.toString());
    console.log('');
  });

taskCmd
  .command('inspect <id>')
  .description('Inspeciona detalhes completos de uma tarefa')
  .action((id) => {
    const task = coagent.taskManager.getTask(id);
    if (!task) {
      console.log(chalk.red(`\n✖ Tarefa '${id}' não encontrada.\n`));
      return;
    }

    console.log(chalk.bold(`\n🔍 Detalhes da Tarefa: ${chalk.cyan(task.id)}\n`));
    console.log(`• Título: ${chalk.bold(task.title)}`);
    console.log(`• Descrição: ${task.description || '(sem descrição)'}`);
    console.log(`• Tipo: ${task.type}`);
    console.log(`• Status: ${chalk.bold.yellow(task.status)}`);
    console.log(`• Prioridade: ${task.priority}`);
    console.log(`• Agente: ${task.assignedAgent ?? 'Não atribuído'}`);
    console.log(`• Dependências: ${task.dependsOn.length > 0 ? task.dependsOn.join(', ') : 'Nenhuma'}`);
    console.log(`• Criada em: ${task.createdAt}`);
    console.log(`• Iniciada em: ${task.startedAt ?? 'N/A'}`);
    console.log(`• Concluída em: ${task.completedAt ?? 'N/A'}`);

    if (task.error) {
      console.log(chalk.red(`\n✖ Erro Registrado:`));
      console.log(chalk.red(JSON.stringify(task.error, null, 2)));
    }

    if (task.result) {
      console.log(chalk.green(`\n✓ Resultado:`));
      console.log(typeof task.result === 'string' ? task.result : JSON.stringify(task.result, null, 2));
    }
    console.log('');
  });

taskCmd
  .command('cancel <id>')
  .description('Cancela uma tarefa em execução ou na fila')
  .action((id) => {
    coagent.scheduler.cancelRunningTask(id, 'Cancelado via linha de comando');
    console.log(chalk.yellow(`\n✓ Solicitação de cancelamento enviada para tarefa ${id}\n`));
  });

// ==========================================
// Subcomando: RUN (Orquestração de Alto Nível)
// ==========================================
program
  .command('run <objective>')
  .description('Orquestra um plano autônomo com múltiplos agentes para atingir um objetivo')
  .action(async (objective) => {
    console.log(chalk.bold.cyan(`\n🚀 Iniciando Orquestração CoAgent:`));
    console.log(`Objetivo: "${chalk.bold(objective)}"\n`);

    const spinner = ora('Decompondo objetivo e atribuindo agentes aos slots paralelos...').start();

    try {
      const result = await coagent.orchestrator.executeObjective(objective, {
        onProgress: (completed, total) => {
          spinner.text = `Progresso do plano: ${completed}/${total} subtarefas concluídas...`;
        },
      });

      if (result.success) {
        spinner.succeed(chalk.green('Objetivo concluído com sucesso!'));
      } else {
        spinner.warn(chalk.yellow('Objetivo concluído com falhas em algumas etapas.'));
      }

      console.log(chalk.bold(`\n📊 Relatório Consolidado de Execução:`));
      console.log(`• Duração Total: ${(result.durationMs / 1000).toFixed(2)}s`);
      console.log(`• Subtarefas Executadas: ${result.totalTasks}`);
      console.log(`• Sucessos: ${chalk.green(result.completedTasks)} | Falhas: ${chalk.red(result.failedTasks)}`);
      console.log(`• Resumo: ${result.summary}\n`);

      const table = new Table({
        head: [chalk.cyan('Subtarefa'), chalk.cyan('Agente'), chalk.cyan('Status')],
      });

      for (const t of result.taskOutputs) {
        table.push([
          t.title,
          t.agentId ?? 'auto',
          t.status === 'completed' ? chalk.green('✓ OK') : chalk.red('✖ Falhou'),
        ]);
      }

      console.log(table.toString());
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Falha crítica na orquestração'));
      console.error(err);
    }
  });

// ==========================================
// Subcomando: CONFIG
// ==========================================
program
  .command('config')
  .description('Exibe configurações ativas do CoAgent')
  .action(() => {
    console.log(chalk.bold('\n⚙️  Configurações Ativas do CoAgent:\n'));
    console.log(`• Limite Global de Concorrência: ${chalk.cyan('4 agentes simultâneos')}`);
    console.log(`• Limite por Provedor: ${chalk.cyan('2 por provedor (agy, claude-code, codex, opencode)')}`);
    console.log(`• Modo de Segurança Padrão: ${chalk.cyan('workspace-write')}`);
    console.log(`• Banco de Dados: SQLite WAL`);
    console.log(`• Provedores Registrados: Google AGY, Claude Code, OpenAI Codex, OpenCode\n`);
  });

// ==========================================
// Subcomando: DASHBOARD
// ==========================================
program
  .command('dashboard')
  .description('Inicia o dashboard web local em tempo real')
  .option('-p, --port <port>', 'Porta do dashboard', '3333')
  .action((options) => {
    const port = parseInt(options.port, 10);
    console.log(chalk.bold.cyan(`\n🌐 Iniciando CoAgent Web Dashboard na porta ${port}...`));
    console.log(`Acesse: ${chalk.underline.bold(`http://localhost:${port}`)}\n`);
    console.log(`Para iniciar o serviço autônomo do dashboard em segundo plano, execute:`);
    console.log(chalk.green(`  npm --workspace=@coagent/dashboard run start -- --port ${port}\n`));
  });

program.parse(process.argv);
