#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { exec, execSync } from 'node:child_process';
import { startDashboardServer } from '@coagent/dashboard';
import { App } from './ui/App.js';

if (!process.env['COAGENT_LOG_LEVEL'] && !process.env['DEBUG']) {
  process.env['COAGENT_LOG_LEVEL'] = 'warn';
}

import { bootstrapCoAgent } from '@coagent/orchestrator';
import { TaskPriority, TaskType } from '@coagent/protocol';

const isDangerBypass = process.argv.includes('--dangerously-skip-permissions');
const coagent = bootstrapCoAgent({ dangerouslySkipPermissions: isDangerBypass });
const program = new Command();

/**
 * Inicia a sessão interativa TUI idêntica ao Claude Code com Ink/React.
 */
async function startInteractiveSession(initialPrompt?: string) {
  // Inicia o servidor do dashboard na porta 3333 em segundo plano silenciosamente
  await startDashboardServer(3333, coagent).catch(() => {});

  const { waitUntilExit } = render(
    React.createElement(App, {
      coagent,
      dangerBypass: isDangerBypass,
      initialPrompt,
    })
  );
  await waitUntilExit();
}

// ==========================================
// Configuração principal da CLI
// ==========================================
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

    // Comportamento Padrão: entra direto na Sessão Interativa TUI idêntica ao Claude Code
    await startInteractiveSession(promptText);
  });

// ==========================================
// Subcomando: TEST (Validação Rápida / Hello World)
// ==========================================
program
  .command('test [agentId]')
  .description('Executa um teste básico ("Hello World") para validar a conectividade e execução de um ou todos os agentes')
  .action(async (agentId?: string) => {
    console.log(chalk.bold.cyan('\n🧪 CoAgent — Teste de Validação Básica (Hello World):\n'));

    const agentsToTest = agentId
      ? coagent.agentRegistry.listAgents().filter((a) => a.id === agentId)
      : coagent.agentRegistry.listAgents();

    if (agentsToTest.length === 0) {
      console.log(chalk.red(`Nenhum agente encontrado com ID: "${agentId}"\n`));
      return;
    }

    for (const agent of agentsToTest) {
      const spinner = ora(`Testando conectividade e execução com ${agent.name} (${agent.id})...`).start();
      const testTask = coagent.taskManager.createTask({
        title: `Teste Hello World (${agent.id})`,
        description: 'Responda exatamente apenas com a palavra: "HELLO_COAGENT_OK"',
        type: 'general',
        priority: 'high',
        assignedAgent: agent.id,
        timeoutMs: 30_000,
        securityPolicy: {
          dangerouslySkipPermissions: true,
        },
      });

      try {
        coagent.scheduler.submitTask(testTask);

        let completed = false;
        let attempts = 0;
        while (!completed && attempts < 100) {
          await new Promise((r) => setTimeout(r, 200));
          const current = coagent.taskManager.getTask(testTask.id);
          if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
            completed = true;
            if (current.status === 'completed') {
              spinner.succeed(chalk.green(`✓ [${agent.id}] ${agent.name} respondendo com sucesso!`));
              if (current.result) {
                const preview = typeof current.result === 'string' ? current.result : JSON.stringify(current.result);
                console.log(chalk.gray(`   Saída: ${preview.slice(0, 120)}...\n`));
              }
            } else {
              spinner.warn(chalk.yellow(`⚠️ [${agent.id}] ${agent.name} finalizou com status: ${current.status}`));
              if (current.error) {
                console.log(chalk.gray(`   Detalhe: ${current.error.message.slice(0, 140)}...\n`));
              }
            }
          }
          attempts++;
        }

        if (!completed) {
          spinner.fail(chalk.red(`✖ [${agent.id}] Tempo limite excedido aguardando resposta.`));
        }
      } catch (err) {
        spinner.fail(chalk.red(`✖ [${agent.id}] Erro ao despachar teste: ${err instanceof Error ? err.message : String(err)}`));
      }
    }

    console.log(chalk.bold.green('Validação concluída.\n'));
  });

// ==========================================
// Subcomando: ADDAGENTS (Assistente de Login)
// ==========================================
program
  .command('addagents')
  .alias('auth')
  .description('Assistente para autenticar e conectar contas Google, Claude Code, Codex e OpenCode')
  .action(() => {
    console.log(chalk.bold.cyan('\n🔑 Assistente de Contas & Login de Agentes:\n'));
    console.log('Comandos oficiais para autenticação no terminal:');
    console.log(`  • Google Antigravity: ${chalk.green.bold('agy auth')} ou ${chalk.green.bold('agy login')}`);
    console.log(`  • Claude Code CLI:    ${chalk.green.bold('claude login')}`);
    console.log(`  • OpenAI Codex CLI:   ${chalk.green.bold('codex login')}`);
    console.log(`  • OpenCode CLI:       ${chalk.green.bold('opencode auth')}`);
    console.log(`\n💡 Para ligar ou desligar qualquer agente com 1 clique, use: ${chalk.cyan.underline('coagent dashboard')}\n`);
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

// ==========================================
// Subcomando: CONFIG
// ==========================================
program
  .command('config')
  .description('Exibe configurações ativas do CoAgent')
  .action(() => {
    console.log(chalk.bold('\n⚙️  Configurações Ativas do CoAgent:\n'));
    console.log(`• Engine de Interface: ${chalk.cyan('Ink / React (Experiência Idêntica ao Claude Code)')}`);
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
  .alias('dash')
  .description('Inicia e abre o dashboard web local no navegador')
  .option('-p, --port <port>', 'Porta do dashboard', '3333')
  .action(async (options: { port?: string }) => {
    const port = parseInt(options.port ?? '3333', 10);
    const url = `http://localhost:${port}`;
    console.log(chalk.bold.cyan(`\n🌐 Iniciando e abrindo CoAgent Web Dashboard em: ${chalk.underline(url)}\n`));
    await startDashboardServer(port, coagent).catch(() => {});
    if (process.platform === 'win32') {
      exec(`powershell -NoProfile -Command "Start-Process '${url}'"`);
    } else if (process.platform === 'darwin') {
      exec(`open ${url}`);
    } else {
      exec(`xdg-open ${url}`);
    }
  });

program.parse(process.argv);
