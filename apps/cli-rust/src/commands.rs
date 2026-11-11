use crate::client::CoAgentClient;
use crate::types::*;
use colored::Colorize;
use comfy_table::modifiers::UTF8_ROUND_CORNERS;
use comfy_table::presets::UTF8_FULL;
use comfy_table::{Cell, Color, Row, Table};
use indicatif::{ProgressBar, ProgressStyle};
use std::process::Command;
use std::time::Duration;

pub async fn handle_agents_list(client: &CoAgentClient) -> Result<(), Box<dyn std::error::Error>> {
    let agents = client.list_agents().await?;

    println!("\n{}", format!("🤖 Agentes Registrados no CoAgent ({}):", agents.len()).bold().cyan());

    let mut table = Table::new();
    table.load_preset(UTF8_FULL).apply_modifier(UTF8_ROUND_CORNERS);
    table.set_header(vec![
        Cell::new("ID").fg(Color::Cyan),
        Cell::new("Nome").fg(Color::Cyan),
        Cell::new("Provedor").fg(Color::Cyan),
        Cell::new("Status").fg(Color::Cyan),
        Cell::new("Carga/Max").fg(Color::Cyan),
    ]);

    for a in agents {
        let status_color = if a.status == "idle" {
            Color::Green
        } else {
            Color::Yellow
        };

        let max_conc = a.capabilities.map(|c| c.max_concurrency).unwrap_or(2);
        let load_str = format!("{}/{}", a.active_tasks_count, max_conc);

        table.add_row(Row::from(vec![
            Cell::new(a.id).fg(Color::White),
            Cell::new(a.name).fg(Color::White),
            Cell::new(a.provider).fg(Color::DarkGrey),
            Cell::new(a.status).fg(status_color),
            Cell::new(load_str).fg(Color::Cyan),
        ]));
    }

    println!("{}\n", table);
    Ok(())
}

pub async fn handle_agents_status(client: &CoAgentClient) -> Result<(), Box<dyn std::error::Error>> {
    let status = client.get_status().await?;

    println!("\n{}", "📊 Status de Execução em Tempo Real:".bold().cyan());
    println!(
        "• Slots Globais de Execução: {} / {}",
        status.concurrency.active.to_string().cyan().bold(),
        status.concurrency.max.to_string().cyan().bold()
    );
    println!("• Tarefas em Execução: {}", status.active_tasks.len().to_string().yellow());
    println!("• Tarefas Aguardando na Fila: {}", status.queued_tasks.len().to_string().blue());
    println!(
        "• Memória de Projeto (COAGENT.md): {}\n",
        if status.project_memory.loaded {
            format!("Ativa ({} regras)", status.project_memory.rules_count).green()
        } else {
            "Não detectada".normal()
        }
    );

    let mut table = Table::new();
    table.load_preset(UTF8_FULL).apply_modifier(UTF8_ROUND_CORNERS);
    table.set_header(vec![
        Cell::new("Agente").fg(Color::Cyan),
        Cell::new("Status").fg(Color::Cyan),
        Cell::new("Ativas").fg(Color::Cyan),
        Cell::new("Concluídas").fg(Color::Green),
        Cell::new("Falhas").fg(Color::Red),
    ]);

    for a in status.agents {
        let status_cell = if a.status == "idle" {
            Cell::new(&a.status).fg(Color::Green)
        } else {
            Cell::new(&a.status).fg(Color::Yellow)
        };

        table.add_row(Row::from(vec![
            Cell::new(a.name),
            status_cell,
            Cell::new(a.active_tasks_count.to_string()),
            Cell::new(a.total_tasks_completed.to_string()).fg(Color::Green),
            Cell::new(a.total_tasks_failed.to_string()).fg(Color::Red),
        ]));
    }

    println!("{}\n", table);
    Ok(())
}

pub async fn handle_task_create(
    client: &CoAgentClient,
    title: &str,
    description: Option<&str>,
    task_type: Option<&str>,
    priority: Option<&str>,
    agent_id: Option<&str>,
    dangerously_skip: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let body = CreateTaskBody {
        title: title.to_string(),
        description: description.map(|s| s.to_string()),
        task_type: task_type.map(|s| s.to_string()),
        priority: priority.map(|s| s.to_string()),
        agent_id: agent_id.map(|s| s.to_string()),
        dangerously_skip_permissions: dangerously_skip,
    };

    let task = client.create_task(body).await?;

    println!("\n{}", "✓ Tarefa criada e agendada com sucesso!".bold().green());
    println!("• ID: {}", task.id.cyan().bold());
    println!("• Título: {}", task.title);
    println!("• Prioridade: {}", task.priority.yellow());
    println!(
        "• Agente: {}",
        task.assigned_agent.unwrap_or_else(|| "Seleção Automática (SmartDelegator)".to_string())
    );
    println!();
    Ok(())
}

pub async fn handle_task_list(
    client: &CoAgentClient,
    limit: usize,
    status: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let tasks = client.list_tasks(limit, status).await?;

    println!("\n{}", format!("📋 Tarefas no CoAgent ({}):", tasks.len()).bold().cyan());

    let mut table = Table::new();
    table.load_preset(UTF8_FULL).apply_modifier(UTF8_ROUND_CORNERS);
    table.set_header(vec![
        Cell::new("ID").fg(Color::Cyan),
        Cell::new("Título").fg(Color::Cyan),
        Cell::new("Tipo").fg(Color::Cyan),
        Cell::new("Status").fg(Color::Cyan),
        Cell::new("Prioridade").fg(Color::Cyan),
        Cell::new("Agente").fg(Color::Cyan),
    ]);

    for t in tasks {
        let status_color = match t.status.as_str() {
            "completed" => Color::Green,
            "running" => Color::Yellow,
            "failed" => Color::Red,
            "waiting_approval" => Color::Magenta,
            _ => Color::Blue,
        };

        table.add_row(Row::from(vec![
            Cell::new(t.id),
            Cell::new(t.title),
            Cell::new(t.task_type),
            Cell::new(t.status).fg(status_color),
            Cell::new(t.priority),
            Cell::new(t.assigned_agent.unwrap_or_else(|| "auto".to_string())),
        ]));
    }

    println!("{}\n", table);
    Ok(())
}

pub async fn handle_task_inspect(client: &CoAgentClient, id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let t = client.get_task(id).await?;

    println!("\n{}", format!("🔍 Detalhes da Tarefa: {}", t.id).bold().cyan());
    println!("• Título: {}", t.title.bold());
    println!("• Descrição: {}", t.description.unwrap_or_else(|| "(sem descrição)".to_string()));
    println!("• Tipo: {}", t.task_type);
    println!("• Status: {}", t.status.yellow().bold());
    println!("• Prioridade: {}", t.priority);
    println!("• Agente: {}", t.assigned_agent.unwrap_or_else(|| "Não atribuído".to_string()));
    println!("• Modelo: {}", t.target_model.unwrap_or_else(|| "N/A".to_string()));
    println!("• Criada em: {}", t.created_at);
    println!("• Iniciada em: {}", t.started_at.unwrap_or_else(|| "N/A".to_string()));
    println!("• Concluída em: {}", t.completed_at.unwrap_or_else(|| "N/A".to_string()));

    if let Some(err) = t.error {
        println!("\n{}", "✖ Erro Registrado:".bold().red());
        println!("{}", serde_json::to_string_pretty(&err)?);
    }

    if let Some(res) = t.result {
        println!("\n{}", "✓ Resultado:".bold().green());
        println!("{}", serde_json::to_string_pretty(&res)?);
    }

    println!();
    Ok(())
}

pub async fn handle_advise(client: &CoAgentClient, query: &str, context: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
    println!("\n{}", "🧠 CoAgent Advisor — Consultoria Sênior:".bold().magenta());

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(ProgressStyle::default_spinner().tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ "));
    spinner.set_message("Analisando questão com o modelo conselheiro...");
    spinner.enable_steady_tick(Duration::from_millis(80));

    let res = client.advise(query, context).await;
    spinner.finish_and_clear();

    match res {
        Ok(adv) => {
            println!("{}", "✓ Parecer do Advisor gerado:".green().bold());
            println!("\n{}\n", adv.advice.cyan());
        }
        Err(e) => {
            eprintln!("{} {}", "✖ Falha ao consultar Advisor:".red().bold(), e);
        }
    }
    Ok(())
}

pub async fn handle_review(client: &CoAgentClient, custom_diff: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
    println!("\n{}", "🧐 CoAgent Advisor — Ultrareview de Código:".bold().magenta());

    let diff_text = match custom_diff {
        Some(d) => d.to_string(),
        None => {
            let output = Command::new("git").args(["diff", "HEAD"]).output()?;
            let mut text = String::from_utf8_lossy(&output.stdout).to_string();
            if text.trim().is_empty() {
                let cached = Command::new("git").args(["diff", "--cached"]).output()?;
                text = String::from_utf8_lossy(&cached.stdout).to_string();
            }
            text
        }
    };

    if diff_text.trim().is_empty() {
        println!("{}\n", "Nenhuma alteração detectada no Git diff para revisão.".yellow());
        return Ok(());
    }

    let review = client.review(&diff_text).await?;

    if review.approved {
        println!("{}", "✓ Status da Revisão: Aprovado pelo Advisor!".green().bold());
    } else {
        println!("{}", "✖ Status da Revisão: Reprovado pelo Advisor!".red().bold());
    }

    println!("• Resumo: {}\n", review.summary);

    if !review.issues_found.is_empty() {
        println!("{}", "Observações Encontradas:".bold());
        for issue in review.issues_found {
            let prefix = if issue.severity == "critical" {
                "[Crítico]".red().bold()
            } else {
                "[Aviso]".yellow().bold()
            };
            println!("  • {} {}", prefix, issue.message);
        }
        println!();
    }

    Ok(())
}

pub async fn handle_test(client: &CoAgentClient, agent_id: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
    println!("\n{}", "🧪 CoAgent — Teste de Validação Básica (Hello World):".bold().cyan());

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(ProgressStyle::default_spinner().tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ "));
    spinner.set_message("Disparando validação nos agentes...");
    spinner.enable_steady_tick(Duration::from_millis(80));

    let res = client.run_test(agent_id).await?;
    spinner.finish_and_clear();

    for item in res.results {
        if item.success {
            println!(
                "{} [{} ({})] {}",
                "✓".green().bold(),
                item.name.bold(),
                item.agent_id.cyan(),
                "respondendo com sucesso!".green()
            );
            if let Some(out) = item.output {
                let preview: String = out.chars().take(120).collect();
                println!("   {}", preview.dimmed());
            }
        } else {
            println!(
                "{} [{} ({})] {}",
                "⚠️".yellow(),
                item.name.bold(),
                item.agent_id.cyan(),
                "falhou na validação!".yellow()
            );
            if let Some(err) = item.error {
                println!("   Detalhe: {}", err.dimmed());
            }
        }
    }

    println!("\n{}\n", "Validação concluída.".bold().green());
    Ok(())
}

pub fn handle_config(danger_bypass: bool) {
    println!("\n{}", "⚙️  Configurações Ativas do CoAgent:".bold());
    println!("• CLI Engine: {}", "Rust 1.94 (Nativo / Tokio Async)".cyan().bold());
    println!("• Backend Daemon: {}", "TypeScript (Fastify + SQLite WAL)".cyan());
    println!("• Limite Global de Concorrência: {}", "4 agentes simultâneos".cyan());
    println!("• Limite por Provedor: {}", "2 por provedor (agy, claude-code, codex, opencode)".cyan());
    println!(
        "• Dangerously Skip Permissions: {}",
        if danger_bypass { "ATIVADO".red().bold() } else { "DESATIVADO".green().bold() }
    );
    println!("• Isolamento Git Worktrees: {}", "Habilitado".green());
    println!("• Auto-Cura (Self-Healing Loop): {}", "Habilitado".green());
    println!("• CoAgent Advisor: {}", "Ativo".magenta());
    println!("• Cascata de Inteligência (--exhaust): {}", "Ativa (Pro -> Balanced -> Fast)".green());
    println!();
}
