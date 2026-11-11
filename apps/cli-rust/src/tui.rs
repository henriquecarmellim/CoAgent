use crate::client::CoAgentClient;
use colored::Colorize;
use crossterm::{
    cursor,
    event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute,
    terminal::{self, Clear, ClearType},
};
use indicatif::{ProgressBar, ProgressStyle};
use std::io::{self, Write};
use std::process::Command;
use std::time::Duration;

const BANNER_ART: &str = r#"  ██████╗ ██████╗  █████╗  ██████╗ ███████╗███╗   ██╗████████╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
 ██║     ██║   ██║███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
 ██║     ██║   ██║██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
 ╚██████╗╚██████╔╝██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   "#;

/// Renderiza o cabeçalho idêntico ao Claude Code
fn print_header(cwd: &str, danger_bypass: bool) {
    println!("\n{}", BANNER_ART.cyan().bold());
    println!(
        "  {} {}",
        "CoAgent".bold().white(),
        "(v1.0.0 • Rust Native CLI • SQLite WAL)".dimmed()
    );
    println!("  {}\n", "Multiagent AI Orchestrator • Inspired by Claude Code".dimmed());

    let cwd_line = format!("  Working Directory: {}", cwd.cyan());
    let slots_line = format!(
        "  Slots: {}  •  Segurança: {}",
        "0/4 ativos".green().bold(),
        if danger_bypass {
            "⚠️  Dangerously Skip Permissions [ATIVO]".red().bold()
        } else {
            "🛡️  Workspace-Write".green()
        }
    );
    let agents_line = format!(
        "  Agentes: {} agy-1 (Pro)  {} agy-2 (Flash)  {} claude-code  {} codex  {} opencode",
        "●".green(),
        "●".yellow(),
        "●".blue(),
        "●".magenta(),
        "●".cyan()
    );

    println!("  ╭────────────────────────────────────────────────────────────────────────╮");
    println!("  │ {:<70} │", cwd_line.trim_start());
    println!("  │ {:<70} │", slots_line.trim_start());
    println!("  │ {:<70} │", agents_line.trim_start());
    println!("  ╰────────────────────────────────────────────────────────────────────────╯");
    println!();
    println!(
        "  {}",
        "Digite seu objetivo ou use / para comandos (/help, /addagents, /dash, /exit).".dimmed()
    );
    println!(
        "  {}",
        "────────────────────────────────────────────────────────────────────────────".dimmed()
    );
    println!();
}

/// Executa o assistente /addagents com login nas contas
fn handle_add_agents() {
    println!("\n{}", "🔑 Assistente de Contas & Agentes (Login)".bold().cyan());
    println!("Selecione qual provedor você deseja autenticar:\n");
    println!("  {} Google Antigravity (AGY)  -> 'agy auth' ou 'agy login'", "1.".bold());
    println!("  {} Claude Code               -> 'claude login'", "2.".bold());
    println!("  {} OpenAI Codex CLI          -> 'codex login'", "3.".bold());
    println!("  {} OpenCode CLI              -> 'opencode auth'", "4.".bold());
    println!("  {} Abrir Dashboard Web de Agentes (Ligar/Desligar)\n", "5.".bold());
    println!(
        "  {}",
        "Dica: Para autenticar, digite o comando do provedor no seu terminal ou escolha a opção.".dimmed()
    );
    println!();
}

/// Abre o Dashboard Web no navegador
fn open_dashboard(port: u16) {
    let url = format!("http://localhost:{}", port);
    println!(
        "\n{} {}\n",
        "🌐 Abrindo Painel Web do CoAgent no navegador:".bold().cyan(),
        url.underline().bold()
    );

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd").args(["/c", "start", &url]).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(&url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(&url).spawn();
    }
}

pub async fn run_interactive_tui(
    client: CoAgentClient,
    initial_prompt: Option<String>,
    danger_bypass: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    // Inicia o backend em segundo plano de forma transparente
    let _ = client.ensure_backend_running().await;

    print_header(&cwd, danger_bypass);

    // Se houve prompt inicial passado na chamada da CLI
    if let Some(prompt) = initial_prompt {
        execute_user_prompt(&client, &prompt).await;
    }

    let mut history: Vec<String> = Vec::new();
    let mut history_index: Option<usize> = None;

    loop {
        // Prompt estilo Claude Code com Chevron
        print!("{} ", "❯".bold().cyan());
        io::stdout().flush()?;

        let mut input_buffer = String::new();
        let mut cursor_pos = 0;

        terminal::enable_raw_mode()?;

        loop {
            if event::poll(Duration::from_millis(100))? {
                if let Event::Key(key) = event::read()? {
                    // CORREÇÃO CRÍTICA DO WINDOWS: Ignora KeyEventKind::Release e Repeat
                    if key.kind != KeyEventKind::Press {
                        continue;
                    }

                    match key.code {
                        KeyCode::Char(c) => {
                            if key.modifiers.contains(KeyModifiers::CONTROL) {
                                match c {
                                    'c' | 'C' => {
                                        input_buffer.clear();
                                        terminal::disable_raw_mode()?;
                                        println!("^C");
                                        break;
                                    }
                                    'd' | 'D' => {
                                        terminal::disable_raw_mode()?;
                                        println!("\n{}", "Até logo! Encerrando CoAgent.".yellow());
                                        return Ok(());
                                    }
                                    'l' | 'L' => {
                                        execute!(io::stdout(), Clear(ClearType::All), cursor::MoveTo(0, 0))?;
                                        terminal::disable_raw_mode()?;
                                        print_header(&cwd, danger_bypass);
                                        print!("{} ", "❯".bold().cyan());
                                        io::stdout().flush()?;
                                        terminal::enable_raw_mode()?;
                                        continue;
                                    }
                                    _ => {}
                                }
                            } else {
                                input_buffer.insert(cursor_pos, c);
                                cursor_pos += 1;
                                redraw_line(&input_buffer, cursor_pos)?;
                            }
                        }
                        KeyCode::Backspace => {
                            if cursor_pos > 0 {
                                cursor_pos -= 1;
                                input_buffer.remove(cursor_pos);
                                redraw_line(&input_buffer, cursor_pos)?;
                            }
                        }
                        KeyCode::Delete => {
                            if cursor_pos < input_buffer.len() {
                                input_buffer.remove(cursor_pos);
                                redraw_line(&input_buffer, cursor_pos)?;
                            }
                        }
                        KeyCode::Left => {
                            if cursor_pos > 0 {
                                cursor_pos -= 1;
                                execute!(io::stdout(), cursor::MoveLeft(1))?;
                            }
                        }
                        KeyCode::Right => {
                            if cursor_pos < input_buffer.len() {
                                cursor_pos += 1;
                                execute!(io::stdout(), cursor::MoveRight(1))?;
                            }
                        }
                        KeyCode::Home => {
                            if cursor_pos > 0 {
                                execute!(io::stdout(), cursor::MoveLeft(cursor_pos as u16))?;
                                cursor_pos = 0;
                            }
                        }
                        KeyCode::End => {
                            let diff = input_buffer.len() - cursor_pos;
                            if diff > 0 {
                                execute!(io::stdout(), cursor::MoveRight(diff as u16))?;
                                cursor_pos = input_buffer.len();
                            }
                        }
                        KeyCode::Up => {
                            if !history.is_empty() {
                                let new_idx = match history_index {
                                    None => history.len().saturating_sub(1),
                                    Some(idx) => idx.saturating_sub(1),
                                };
                                history_index = Some(new_idx);
                                input_buffer = history[new_idx].clone();
                                cursor_pos = input_buffer.len();
                                redraw_line(&input_buffer, cursor_pos)?;
                            }
                        }
                        KeyCode::Down => {
                            if let Some(idx) = history_index {
                                if idx + 1 < history.len() {
                                    let new_idx = idx + 1;
                                    history_index = Some(new_idx);
                                    input_buffer = history[new_idx].clone();
                                    cursor_pos = input_buffer.len();
                                    redraw_line(&input_buffer, cursor_pos)?;
                                } else {
                                    history_index = None;
                                    input_buffer.clear();
                                    cursor_pos = 0;
                                    redraw_line(&input_buffer, cursor_pos)?;
                                }
                            }
                        }
                        KeyCode::Enter => {
                            terminal::disable_raw_mode()?;
                            println!();
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        let input = input_buffer.trim().to_string();
        if input.is_empty() {
            continue;
        }

        history.push(input.clone());
        history_index = None;

        // Trata slash commands estilo Claude Code
        if input.starts_with('/') {
            let parts: Vec<&str> = input[1..].split_whitespace().collect();
            let cmd = parts.first().copied().unwrap_or("").to_lowercase();
            let args = if parts.len() > 1 { parts[1..].join(" ") } else { String::new() };

            match cmd.as_str() {
                "exit" | "quit" | "sair" => {
                    println!("{}", "\nAté logo! Sessão do CoAgent encerrada.\n".yellow());
                    break;
                }
                "clear" | "cls" => {
                    execute!(io::stdout(), Clear(ClearType::All), cursor::MoveTo(0, 0))?;
                    print_header(&cwd, danger_bypass);
                }
                "help" | "ajuda" => {
                    print_help();
                }
                "addagents" | "addagent" | "login" | "auth" => {
                    handle_add_agents();
                }
                "dashboard" | "dash" => {
                    open_dashboard(3333);
                }
                "agents" => {
                    let _ = crate::commands::handle_agents_list(&client).await;
                }
                "status" => {
                    let _ = crate::commands::handle_agents_status(&client).await;
                }
                "tasks" => {
                    let _ = crate::commands::handle_task_list(&client, 20, None).await;
                }
                "test" => {
                    let agent_id = if args.is_empty() { None } else { Some(args.as_str()) };
                    let _ = crate::commands::handle_test(&client, agent_id).await;
                }
                "advise" => {
                    if args.is_empty() {
                        println!("{} Uso: /advise <sua dúvida técnica>\n", "⚠️".yellow());
                    } else {
                        let _ = crate::commands::handle_advise(&client, &args, None).await;
                    }
                }
                "review" => {
                    let _ = crate::commands::handle_review(&client, None).await;
                }
                unknown => {
                    println!(
                        "{} Comando desconhecido: /{}. Digite {} para ver os comandos.\n",
                        "✖".red(),
                        unknown,
                        "/help".cyan().bold()
                    );
                }
            }
            continue;
        }

        // Executa prompt/objetivo normalmente com a cascata multiagente
        execute_user_prompt(&client, &input).await;
    }

    Ok(())
}

fn redraw_line(buffer: &str, cursor_pos: usize) -> io::Result<()> {
    let mut stdout = io::stdout();
    execute!(
        stdout,
        cursor::MoveToColumn(0),
        Clear(ClearType::CurrentLine)
    )?;
    print!("{} {}", "❯".bold().cyan(), buffer);
    let target_col = 2 + cursor_pos as u16;
    execute!(stdout, cursor::MoveToColumn(target_col))?;
    stdout.flush()?;
    Ok(())
}

fn print_help() {
    println!("\n{}", "📖 Comandos do CoAgent (Estilo Claude Code):".bold().white());
    println!("  {}   - Assistente para conectar contas Google/Claude/Codex", "/addagents".cyan().bold());
    println!("  {}   - Abre o painel Web para ligar/desligar agentes", "/dashboard".cyan().bold());
    println!("  {}      - Lista agentes registrados e capacidades", "/agents".cyan().bold());
    println!("  {}      - Exibe status dos 4 slots de concorrência", "/status".cyan().bold());
    println!("  {}       - Lista as tarefas recentes e estados", "/tasks".cyan().bold());
    println!("  {}   - Roda validação básica Hello World", "/test [id]".cyan().bold());
    println!("  {} <q>  - Consulta o CoAgent Advisor sênior", "/advise".cyan().bold());
    println!("  {}      - Executa o Ultrareview no Git diff", "/review".cyan().bold());
    println!("  {}       - Limpa a tela mantendo a sessão", "/clear".cyan().bold());
    println!("  {}        - Encerra a sessão do CoAgent", "/exit".cyan().bold());
    println!();
    println!("  {} Digite qualquer instrução para coordenar os agentes automaticamente.\n", "Dica:".dimmed());
}

async fn execute_user_prompt(client: &CoAgentClient, prompt: &str) {
    println!();
    println!("  {}", "╭─ Executando Objetivo Multiagente ──────────────────────────────╮".dimmed());
    println!("  {} {} {}", "│".dimmed(), "Objetivo:".bold().white(), prompt.cyan());
    println!("  {}", "╰────────────────────────────────────────────────────────────────╯".dimmed());
    println!();

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
            .template("{spinner:.cyan} {msg}")
            .unwrap(),
    );
    spinner.set_message("Coordenando agentes e decompondo tarefas...");
    spinner.enable_steady_tick(Duration::from_millis(80));

    match client.execute_objective(prompt, true).await {
        Ok(res) => {
            spinner.finish_and_clear();
            if res.success {
                println!(
                    "  {} {} ({} concluídas, {} falhas)",
                    "✓".bold().green(),
                    "Objetivo alcançado com sucesso!".bold().green(),
                    res.tasks_completed.to_string().green(),
                    res.tasks_failed.to_string().red()
                );
            } else {
                println!(
                    "  {} {}",
                    "⚠️".yellow(),
                    "Execução concluída com alertas:".bold().yellow()
                );
            }

            println!("\n  {}\n", res.summary.white());
        }
        Err(e) => {
            spinner.finish_and_clear();
            println!("  {} Erro ao executar objetivo: {}\n", "✖".bold().red(), e);
        }
    }
}
