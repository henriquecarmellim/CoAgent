#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import { bootstrapCoAgent } from '@coagent/orchestrator';
import { TaskPriority, TaskType } from '@coagent/protocol';

const isDangerBypass = process.argv.includes('--dangerously-skip-permissions');
const coagent = bootstrapCoAgent({ dangerouslySkipPermissions: isDangerBypass });
const program = new Command();

const BANNER_ART = `
${chalk.bold.cyan('  ██████╗ ██████╗  █████╗  ██████╗ ███████╗███╗   ██╗████████╗')}
${chalk.bold.cyan(' ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝')}
${chalk.bold.blue(' ██║     ██║   ██║███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ')}
${chalk.bold.blue(' ██║     ██║   ██║██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ')}
${chalk.bold.magenta(' ╚██████╗╚██████╔╝██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ')}
${chalk.bold.magenta('  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ')}
`;

/**
 * Inicia a sessão interativa TUI (estilo Claude Code).
 */
async function startInteractiveSession(initialPrompt?: string) {
  console.clear();
  console.log(BANNER_ART);
  console.log(chalk.bold.white('  Orquestrador Multiagente Autônomo para Engenharia de Software'));
  console.log(chalk.gray('  v1.0.0 • Windows 11 • Node.js ' + process.version + ' • SQLite WAL\n'));

  // Status dos agentes conectados
  const agents = coagent.agentRegistry.listAgents();
  const agentTags = agents
    .map((a) => {
      const dot = a.status === 'idle' ? chalk.green('●') : chalk.yellow('●');
      return `${dot} ${chalk.bold(a.name)}`;
    })
    .join('  ');

  console.log(`  ${chalk.bold('Agentes Conectados:')} ${agentTags}`);
  console.log(
    `  ${chalk.bold('Concorrência:')} ${chalk.cyan('0/4 slots ativos')}  ${
      isDangerBypass ? chalk.bold.red('⚠️  Dangerously Skip Permissions [ATIVO]') : chalk.green('🛡️  Segurança [Workspace-Write]')
    }`
  );
  console.log(
    chalk.gray('  ─────────────────────────────────────────────────────────────────────────────')
  );
  console.log(
    chalk.gray('  Comandos: /help, /agents, /status, /tasks, /advise, /review, /clear, /exit')
  );
  console.log(
    chalk.gray('  Menções:  @advisor, @claude, @codex, @agy, @opencode ou digite seu objetivo.\n')
  );

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.bold.cyan('coagent > '),
  });

  const handleInput = async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Slash Commands estilo Claude Code
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.slice(1).split(' ');
      const argStr = args.join(' ');

      switch (cmd?.toLowerCase()) {
        case 'exit':
        case 'quit':
        case 'sair':
          console.log(chalk.yellow('\nAté logo! Encerrando sessão do CoAgent.\n'));
          rl.close();
          process.exit(0);
          break;

        case 'clear':
        case 'cls':
          console.clear();
          console.log(BANNER_ART);
          break;

        case 'help':
        case 'ajuda':
          console.log(chalk.bold('\n📖 Comandos do CoAgent Shell:'));
          console.log('  /agents          - Lista os 4 agentes conectados e seus status');
          console.log('  /status          - Exibe uso dos slots de concorrência e tarefas');
          console.log('  /tasks           - Lista as tarefas recentes e seus estados');
          console.log('  /advise <dúvida> - Consulta o CoAgent Advisor sênior');
          console.log('  /review          - Roda o Ultrareview no git diff do repositório');
          console.log('  /clear           - Limpa o terminal');
          console.log('  /exit            - Encerra a sessão interativa\n');
          break;

        case 'agents':
          const table = new Table({
            head: [chalk.cyan('ID'), chalk.cyan('Nome'), chalk.cyan('Status'), chalk.cyan('Concorrência'), chalk.cyan('Sucesso')],
          });
          for (const a of coagent.agentRegistry.listAgents()) {
            table.push([a.id, a.name, a.status === 'idle' ? chalk.green('idle') : chalk.yellow('busy'), `${a.activeTasksCount}/${a.capabilities.maxConcurrency}`, chalk.green(a.totalTasksCompleted)]);
          }
          console.log('\n' + table.toString() + '\n');
          break;

        case 'status':
          const status = coagent.orchestrator.getSystemStatus();
          console.log(`\n• Slots Ocupados: ${chalk.cyan(status.concurrency.active)} / ${chalk.cyan(status.concurrency.max)}`);
          console.log(`• Tarefas em Execução: ${chalk.yellow(status.activeTasks.length)}`);
          console.log(`• Fila de Espera: ${chalk.blue(status.queuedTasks.length)}\n`);
          break;

        case 'tasks':
          const tasks = coagent.taskManager.listTasks(10);
          if (tasks.length === 0) {
            console.log(chalk.gray('\nNenhuma tarefa registrada.\n'));
          } else {
            const taskTable = new Table({
              head: [chalk.cyan('ID'), chalk.cyan('Título'), chalk.cyan('Status'), chalk.cyan('Agente')],
            });
            for (const t of tasks) {
              taskTable.push([t.id.slice(0, 16), t.title, t.status, t.assignedAgent ?? 'auto']);
            }
            console.log('\n' + taskTable.toString() + '\n');
          }
          break;

        case 'advise':
          if (!argStr) {
            console.log(chalk.yellow('\nUso: /advise <sua pergunta ou dúvida técnica>\n'));
          } else {
            console.log(chalk.magenta('\n🧠 Consultando CoAgent Advisor...'));
            const advice = await coagent.orchestrator.advisor.advise(argStr);
            console.log('\n' + chalk.cyan(advice) + '\n');
          }
          break;

        case 'review':
          console.log(chalk.magenta('\n🧐 CoAgent Advisor analisando Git diff...'));
          let diff = '';
          try {
            const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
            diff = execSync('git diff HEAD', { encoding: 'utf-8', shell });
            if (!diff.trim()) diff = execSync('git diff --cached', { encoding: 'utf-8', shell });
          } catch {}
          if (!diff.trim()) {
            console.log(chalk.yellow('Nenhuma alteração no git diff para revisar.\n'));
          } else {
            const review = coagent.orchestrator.advisor.reviewDiff(diff);
            console.log(review.approved ? chalk.green('✓ Aprovado pelo Advisor!') : chalk.red('✖ Reprovado pelo Advisor!'));
            console.log(review.summary + '\n');
          }
          break;

        default:
          console.log(chalk.red(`Comando desconhecido: /${cmd}. Digite /help para ver a lista de comandos.\n`));
      }

      rl.prompt();
      return;
    }

    // Processamento de Objetivo ou Menção
    if (input.startsWith('@advisor')) {
      const q = input.replace(/^@advisor\s*/, '');
      console.log(chalk.magenta('\n🧠 Consultando CoAgent Advisor...'));
      const advice = await coagent.orchestrator.advisor.advise(q);
      console.log('\n' + chalk.cyan(advice) + '\n');
      rl.prompt();
      return;
    }

    // Orquestração Automática com os Agentes
    console.log(chalk.cyan(`\n⚡ Decompondo objetivo e acionando agentes subordinados...`));
    const spinner = ora('Coordenando execução paralela com Advisor e semáforo...').start();

    try {
      const result = await coagent.orchestrator.executeObjective(input, {
        onAdvisorCritique: (critique) => {
          spinner.info(chalk.magenta(`Advisor: ${critique.summary} (Score: ${critique.score}/100)`));
          spinner.start('Executando subtarefas em paralelo...');
        },
        onProgress: (comp, tot) => {
          spinner.text = `Progresso: ${comp}/${tot} subtarefas concluídas...`;
        },
      });

      if (result.success) {
        spinner.succeed(chalk.green('Objetivo concluído com sucesso!'));
      } else {
        spinner.warn(chalk.yellow('Objetivo concluído com falhas em algumas etapas.'));
      }

      console.log(chalk.bold(`\n📊 Relatório do CoAgent (${(result.durationMs / 1000).toFixed(2)}s):`));
      console.log(`• Resumo: ${result.summary}`);

      const resTable = new Table({
        head: [chalk.cyan('Subtarefa'), chalk.cyan('Agente'), chalk.cyan('Status')],
      });

      for (const t of result.taskOutputs) {
        resTable.push([t.title, t.agentId ?? 'auto', t.status === 'completed' ? chalk.green('✓ OK') : chalk.red('✖ Falha')]);
      }
      console.log(resTable.toString() + '\n');
    } catch (err) {
      spinner.fail(chalk.red('Falha na orquestração'));
      console.error(err);
      console.log('');
    }

    rl.prompt();
  };

  rl.on('line', handleInput);

  if (initialPrompt) {
    console.log(chalk.cyan(`Executando instrução inicial: "${initialPrompt}"\n`));
    await handleInput(initialPrompt);
  } else {
    rl.prompt();
  }
}

// Configuração principal da CLI
program
  .name('coagent')
  .description(chalk.bold.cyan('CoAgent — Framework de Orquestração Multiagente de IA'))
  .version('1.0.0')
  .argument('[prompt...]', 'Instrução ou objetivo para iniciar imediatamente a sessão interativa')
  .option('-p, --print', 'Executa uma única instrução de forma não-interativa e imprime a resposta (estilo claude -p)')
  .option(
    '--dangerously-skip-permissions',
    'Bypass e auto-aprovação de todas as permissões de segurança e execução'
  )
  .action(async (promptArray: string[] | undefined, options: { print?: boolean }) => {
    const promptText = promptArray && promptArray.length > 0 ? promptArray.join(' ') : undefined;

    // Flag -p / --print: modo não-interativo igual ao Claude Code (-p)
    if (options.print && promptText) {
      try {
        const result = await coagent.orchestrator.executeObjective(promptText);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }

    // Comportamento Padrão: entra direto na Sessão Interativa TUI
    await startInteractiveSession(promptText);
  });

// ==========================================
// Subcomando: ADVISE
// ==========================================
program
  .command('advise <query>')
  .description('Consulta o CoAgent Advisor para obter conselho estratégico de arquitetura ou engenharia')
  .option('-c, --context <context>', 'Contexto técnico adicional')
  .action(async (query: string, options: { context?: string }) => {
    console.log(chalk.bold.magenta('\n🧠 CoAgent Advisor — Consultoria Sênior:\n'));
    const spinner = ora('Analisando questão com o modelo conselheiro...').start();
    try {
      const advice = await coagent.orchestrator.advisor.advise(query, options.context);
      spinner.succeed(chalk.green('Parecer do Advisor gerado:'));
      console.log('\n' + chalk.cyan(advice) + '\n');
    } catch (err) {
      spinner.fail(chalk.red('Falha ao consultar Advisor'));
      console.error(err);
    }
  });

// ==========================================
// Subcomando: REVIEW
// ==========================================
program
  .command('review')
  .description('Executa uma revisão crítica (Ultrareview) nas alterações Git atuais do repositório')
  .option('-d, --diff <diffText>', 'Diff específico para revisão')
  .action((options: { diff?: string }) => {
    console.log(chalk.bold.magenta('\n🧐 CoAgent Advisor — Ultrareview de Código:\n'));

    let diff = options.diff;
    if (!diff) {
      try {
        const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
        diff = execSync('git diff HEAD', { encoding: 'utf-8', shell });
        if (!diff.trim()) {
          diff = execSync('git diff --cached', { encoding: 'utf-8', shell });
        }
      } catch {
        diff = '';
      }
    }

    if (!diff.trim()) {
      console.log(chalk.yellow('Nenhuma alteração detectada no Git diff para revisão.\n'));
      return;
    }

    const review = coagent.orchestrator.advisor.reviewDiff(diff);
    if (review.approved) {
      console.log(chalk.green(`✓ Status da Revisão: Aprovado pelo Advisor!`));
    } else {
      console.log(chalk.red(`✖ Status da Revisão: Reprovado pelo Advisor!`));
    }

    console.log(`• Resumo: ${review.summary}\n`);

    if (review.issuesFound.length > 0) {
      console.log(chalk.bold('Observações Encontradas:'));
      for (const issue of review.issuesFound) {
        const icon = issue.severity === 'critical' ? chalk.red('✖ [Crítico]') : chalk.yellow('⚠️ [Aviso]');
        console.log(`  ${icon} ${issue.message}`);
      }
      console.log('');
    }
  });

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
    console.log(`• Tarefas Aguardando na Fila: ${chalk.blue(status.queuedTasks.length)}`);
    console.log(`• Memória de Projeto (COAGENT.md): ${status.projectMemory.loaded ? chalk.green('Ativa') : chalk.gray('Não detectada')}\n`);

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
const taskCmd = program.command('task').description('Criação, inspeção, controle e aprovação de tarefas');

taskCmd
  .command('create <title>')
  .description('Cria e enfileira uma nova tarefa no CoAgent')
  .option('-t, --type <type>', 'Tipo de tarefa', 'general')
  .option('-p, --priority <priority>', 'Prioridade (critical, high, normal, low)', 'normal')
  .option('-a, --agent <agentId>', 'ID do agente específico para execução')
  .option('-d, --desc <description>', 'Descrição detalhada da tarefa', '')
  .action((title: string, options: { type?: string; priority?: string; agent?: string; desc?: string }) => {
    const task = coagent.taskManager.createTask({
      title,
      description: options.desc,
      type: (options.type as TaskType) ?? 'general',
      priority: (options.priority as TaskPriority) ?? 'normal',
      assignedAgent: options.agent,
      securityPolicy: {
        dangerouslySkipPermissions: isDangerBypass,
      },
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
  .option('-s, --status <status>', 'Filtrar por status')
  .option('-l, --limit <limit>', 'Limite de tarefas exibidas', '25')
  .action((options: { status?: string; limit?: string }) => {
    let tasks = coagent.taskManager.listTasks(parseInt(options.limit ?? '25', 10));
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
          : t.status === 'waiting_approval'
          ? chalk.magenta(t.status)
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
  .action((id: string) => {
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
  .command('approve <id>')
  .description('Aprova a execução de uma tarefa pausada para autorização humana')
  .action((id: string) => {
    try {
      coagent.taskManager.transitionStatus(id, 'running');
      console.log(chalk.green(`\n✓ Tarefa ${id} APROVADA com sucesso. Execução retomada.\n`));
    } catch (err) {
      console.log(chalk.red(`\n✖ Erro ao aprovar tarefa: ${err instanceof Error ? err.message : String(err)}\n`));
    }
  });

taskCmd
  .command('reject <id>')
  .description('Rejeita e cancela uma tarefa pausada para autorização humana')
  .action((id: string) => {
    coagent.scheduler.cancelRunningTask(id, 'Operação rejeitada pelo usuário');
    console.log(chalk.yellow(`\n✓ Tarefa ${id} REJEITADA e cancelada pelo usuário.\n`));
  });

taskCmd
  .command('cancel <id>')
  .description('Cancela uma tarefa em execução ou na fila')
  .action((id: string) => {
    coagent.scheduler.cancelRunningTask(id, 'Cancelado via linha de comando');
    console.log(chalk.yellow(`\n✓ Solicitação de cancelamento enviada para tarefa ${id}\n`));
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
    console.log(`• Dangerously Skip Permissions: ${isDangerBypass ? chalk.red('ATIVADO') : chalk.green('DESATIVADO')}`);
    console.log(`• Isolamento Git Worktrees: ${chalk.green('Habilitado')}`);
    console.log(`• Auto-Cura (Self-Healing Loop): ${chalk.green('Habilitado')}`);
    console.log(`• CoAgent Advisor: ${chalk.magenta('Ativo')}`);
    console.log(`• Banco de Dados: SQLite WAL\n`);
  });

// ==========================================
// Subcomando: DASHBOARD
// ==========================================
program
  .command('dashboard')
  .description('Inicia o dashboard web local em tempo real')
  .option('-p, --port <port>', 'Porta do dashboard', '3333')
  .action((options: { port?: string }) => {
    const port = parseInt(options.port ?? '3333', 10);
    console.log(chalk.bold.cyan(`\n🌐 Iniciando CoAgent Web Dashboard na porta ${port}...`));
    console.log(`Acesse: ${chalk.underline.bold(`http://localhost:${port}`)}\n`);
    console.log(`Para iniciar o serviço autônomo do dashboard em segundo plano, execute:`);
    console.log(chalk.green(`  node apps/dashboard/dist/server.js\n`));
  });

program.parse(process.argv);
