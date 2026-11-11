use crate::client::CoAgentClient;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Terminal,
};
use std::io;

pub async fn run_interactive_tui(
    client: CoAgentClient,
    initial_prompt: Option<String>,
    danger_bypass: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Garante backend
    let _ = client.ensure_backend_running().await;

    // Configura terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut input = String::new();
    let mut messages: Vec<(String, Color)> = vec![
        (
            "██████╗ ██████╗  █████╗  ██████╗ ███████╗███╗   ██╗████████╗".to_string(),
            Color::Cyan,
        ),
        (
            "██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝".to_string(),
            Color::Cyan,
        ),
        (
            "██║     ██║   ██║███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ".to_string(),
            Color::Blue,
        ),
        (
            "██║     ██║   ██║██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ".to_string(),
            Color::Blue,
        ),
        (
            "╚██████╗╚██████╔╝██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ".to_string(),
            Color::Magenta,
        ),
        (
            "╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ".to_string(),
            Color::Magenta,
        ),
        (
            "Bem-vindo ao CoAgent (Rust Native Engine v1.0.0)".to_string(),
            Color::White,
        ),
        (
            "Comandos: /help, /test, /agents, /status, /tasks, /advise, /review, /clear, /exit".to_string(),
            Color::DarkGray,
        ),
        (
            format!(
                "Segurança: {}",
                if danger_bypass {
                    "⚠️  Dangerously Skip Permissions ATIVO"
                } else {
                    "🛡️  Proteção Workspace-Write Ativa"
                }
            ),
            if danger_bypass { Color::Red } else { Color::Green },
        ),
    ];

    if let Some(p) = initial_prompt {
        messages.push((format!("Executando objetivo inicial: {}", p), Color::Yellow));
    }

    loop {
        terminal.draw(|f| {
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(3), // Status Header
                    Constraint::Min(5),    // Message log
                    Constraint::Length(3), // Input box
                ])
                .split(f.area());

            // Header Block
            let header_text = vec![Line::from(vec![
                Span::styled("CoAgent v1.0.0 ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                Span::styled("• Slots: [0/4 Ativos] ", Style::default().fg(Color::Green)),
                Span::styled("• Agentes: ● agy-1 ● agy-2 ● claude ● codex ● opencode ", Style::default().fg(Color::Yellow)),
            ])];
            let header = Paragraph::new(header_text).block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Status do Sistema Multiagente "),
            );
            f.render_widget(header, chunks[0]);

            // Messages Block
            let items: Vec<ListItem> = messages
                .iter()
                .rev()
                .take(30)
                .rev()
                .map(|(msg, color)| {
                    ListItem::new(Line::from(Span::styled(msg.as_str(), Style::default().fg(*color))))
                })
                .collect();

            let message_list = List::new(items).block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Terminal CoAgent / Diálogo "),
            );
            f.render_widget(message_list, chunks[1]);

            // Input Block
            let input_widget = Paragraph::new(Line::from(vec![
                Span::styled("coagent > ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                Span::raw(&input),
            ]))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Digite seu objetivo ou comando com / (ex: /test, /agents, /advise) "),
            );
            f.render_widget(input_widget, chunks[2]);
        })?;

        if event::poll(std::time::Duration::from_millis(50))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char(c) => {
                        input.push(c);
                    }
                    KeyCode::Backspace => {
                        input.pop();
                    }
                    KeyCode::Enter => {
                        let text = input.trim().to_string();
                        input.clear();

                        if !text.is_empty() {
                            messages.push((format!("coagent > {}", text), Color::White));

                            if text.starts_with('/') {
                                let parts: Vec<&str> = text[1..].split_whitespace().collect();
                                match parts.first().copied() {
                                    Some("exit") | Some("quit") | Some("sair") => {
                                        break;
                                    }
                                    Some("clear") | Some("cls") => {
                                        messages.clear();
                                    }
                                    Some("help") | Some("ajuda") => {
                                        messages.push(("📖 Comandos disponíveis:".to_string(), Color::Cyan));
                                        messages.push(("  /test           - Roda validação Hello World nos agentes".to_string(), Color::White));
                                        messages.push(("  /agents         - Lista agentes e cargas ativas".to_string(), Color::White));
                                        messages.push(("  /status         - Exibe uso de slots e concorrência".to_string(), Color::White));
                                        messages.push(("  /tasks          - Lista tarefas recentes".to_string(), Color::White));
                                        messages.push(("  /advise <dúvida> - Consulta o CoAgent Advisor".to_string(), Color::Magenta));
                                        messages.push(("  /review         - Roda Ultrareview no git diff".to_string(), Color::Magenta));
                                        messages.push(("  /exit           - Sair da sessão interativa".to_string(), Color::DarkGray));
                                    }
                                    Some("test") => {
                                        messages.push(("Iniciando teste Hello World nos agentes...".to_string(), Color::Yellow));
                                        match client.run_test(None).await {
                                            Ok(res) => {
                                                for r in res.results {
                                                    let color = if r.success { Color::Green } else { Color::Yellow };
                                                    messages.push((
                                                        format!("• [{}] {}: {}", r.agent_id, r.name, if r.success { "OK" } else { "FALHA" }),
                                                        color,
                                                    ));
                                                }
                                            }
                                            Err(e) => {
                                                messages.push((format!("Erro ao executar teste: {}", e), Color::Red));
                                            }
                                        }
                                    }
                                    Some("agents") => {
                                        match client.list_agents().await {
                                            Ok(agents) => {
                                                messages.push((format!("Agentes Conectados ({}):", agents.len()), Color::Cyan));
                                                for a in agents {
                                                    messages.push((
                                                        format!("• [{}] {} ({}) - {}", a.id, a.name, a.provider, a.status),
                                                        if a.status == "idle" { Color::Green } else { Color::Yellow },
                                                    ));
                                                }
                                            }
                                            Err(e) => {
                                                messages.push((format!("Erro ao listar agentes: {}", e), Color::Red));
                                            }
                                        }
                                    }
                                    Some("status") => {
                                        match client.get_status().await {
                                            Ok(st) => {
                                                messages.push((
                                                    format!("Slots: {}/{} | Fila: {} | Tarefas: {}", st.concurrency.active, st.concurrency.max, st.concurrency.queue_size, st.active_tasks.len()),
                                                    Color::Cyan,
                                                ));
                                            }
                                            Err(e) => {
                                                messages.push((format!("Erro ao obter status: {}", e), Color::Red));
                                            }
                                        }
                                    }
                                    Some(other) => {
                                        messages.push((format!("Comando desconhecido: /{}. Digite /help.", other), Color::Red));
                                    }
                                    None => {}
                                }
                            } else {
                                // Envia como objetivo para a cascata de agentes
                                messages.push(("Submetendo objetivo ao orquestrador multiagente...".to_string(), Color::Yellow));
                                match client.execute_objective(&text, true).await {
                                    Ok(res) => {
                                        messages.push((
                                            format!("✓ Concluído com sucesso! ({} concluídas, {} falhas)", res.tasks_completed, res.tasks_failed),
                                            Color::Green,
                                        ));
                                        messages.push((res.summary, Color::White));
                                    }
                                    Err(e) => {
                                        messages.push((format!("✖ Erro ao executar objetivo: {}", e), Color::Red));
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    // Restaura terminal
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen, DisableMouseCapture)?;
    terminal.show_cursor()?;

    println!("\nAté logo! Sessão do CoAgent encerrada.\n");
    Ok(())
}
