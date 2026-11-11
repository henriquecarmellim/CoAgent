mod client;
mod commands;
mod tui;
mod types;

use clap::{Args, Parser, Subcommand};
use client::CoAgentClient;
use colored::Colorize;
use commands::*;
use tui::run_interactive_tui;

const BANNER: &str = r#"
  ██████╗ ██████╗  █████╗  ██████╗ ███████╗███╗   ██╗████████╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
 ██║     ██║   ██║███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
 ██║     ██║   ██║██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
 ╚██████╗╚██████╔╝██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
"#;

#[derive(Parser, Debug)]
#[command(
    name = "coagent",
    version = "1.0.0",
    about = "CoAgent — Framework Nativo de Orquestração Multiagente de IA (Rust Native CLI)",
    author = "Henrique Carmellim"
)]
struct Cli {
    #[arg(help = "Instrução ou objetivo para iniciar imediatamente a sessão")]
    prompt: Vec<String>,

    #[arg(short = 'p', long = "print", global = true, help = "Executa instrução em modo não-interativo e imprime resultado")]
    print: bool,

    #[arg(long = "dangerously-skip-permissions", global = true, help = "Bypass de todas as permissões de segurança e execução")]
    dangerously_skip_permissions: bool,

    #[arg(long = "backend-url", global = true, help = "URL do servidor backend CoAgent (padrão: http://127.0.0.1:3333)")]
    backend_url: Option<String>,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    #[command(about = "Executa teste de validação básica ('Hello World') nos agentes")]
    Test {
        #[arg(help = "ID do agente opcional (ex: agy-1, agy-2, claude-code, codex, opencode)")]
        agent_id: Option<String>,
    },

    #[command(about = "Consulta o CoAgent Advisor sênior para conselhos de arquitetura")]
    Advise {
        #[arg(help = "Pergunta ou consulta técnica")]
        query: String,

        #[arg(short, long, help = "Contexto adicional do projeto")]
        context: Option<String>,
    },

    #[command(about = "Executa revisão crítica (Ultrareview) nas alterações Git do repositório")]
    Review {
        #[arg(short, long, help = "Diff específico para revisão ao invés de ler git HEAD")]
        diff: Option<String>,
    },

    #[command(about = "Gerencia e monitora os agentes")]
    Agents {
        #[command(subcommand)]
        action: AgentsCommands,
    },

    #[command(about = "Cria, inspeciona e controla tarefas do sistema")]
    Task {
        #[command(subcommand)]
        action: TaskCommands,
    },

    #[command(about = "Exibe as configurações ativas do CoAgent")]
    Config,

    #[command(about = "Assistente de autenticação e login de contas (Google, Claude, Codex, OpenCode)")]
    Addagents,

    #[command(about = "Abre ou exibe o endereço do Web Dashboard")]
    Dashboard {
        #[arg(short, long, default_value = "3333", help = "Porta do Dashboard")]
        port: u16,
    },
}

#[derive(Subcommand, Debug)]
enum AgentsCommands {
    #[command(about = "Lista todos os agentes registrados")]
    List,
    #[command(about = "Exibe o status em tempo real da carga de execução dos agentes")]
    Status,
}

#[derive(Subcommand, Debug)]
enum TaskCommands {
    #[command(about = "Cria uma nova tarefa")]
    Create(CreateTaskArgs),
    #[command(about = "Lista tarefas")]
    List {
        #[arg(short, long, default_value = "25")]
        limit: usize,
        #[arg(short, long)]
        status: Option<String>,
    },
    #[command(about = "Inspeciona detalhes de uma tarefa")]
    Inspect { id: String },
    #[command(about = "Aprova uma tarefa pausada para aprovação")]
    Approve { id: String },
    #[command(about = "Rejeita uma tarefa pausada para aprovação")]
    Reject { id: String },
    #[command(about = "Cancela uma tarefa")]
    Cancel { id: String },
}

#[derive(Args, Debug)]
struct CreateTaskArgs {
    #[arg(help = "Título da tarefa")]
    title: String,
    #[arg(short = 'd', long = "desc", help = "Descrição")]
    desc: Option<String>,
    #[arg(short = 't', long = "type", help = "Tipo")]
    task_type: Option<String>,
    #[arg(short = 'p', long = "priority", help = "Prioridade (critical, high, normal, low)")]
    priority: Option<String>,
    #[arg(short = 'a', long = "agent", help = "ID do Agente")]
    agent: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let client = CoAgentClient::new(cli.backend_url);

    // Trata comandos diretos
    if let Some(cmd) = cli.command {
        // Garante que o backend TypeScript está respondendo
        if let Err(e) = client.ensure_backend_running().await {
            eprintln!("{} {}", "⚠️  Aviso:".yellow().bold(), e);
        }

        match cmd {
            Commands::Test { agent_id } => {
                handle_test(&client, agent_id.as_deref()).await?;
            }
            Commands::Advise { query, context } => {
                handle_advise(&client, &query, context.as_deref()).await?;
            }
            Commands::Review { diff } => {
                handle_review(&client, diff.as_deref()).await?;
            }
            Commands::Agents { action } => match action {
                AgentsCommands::List => {
                    handle_agents_list(&client).await?;
                }
                AgentsCommands::Status => {
                    handle_agents_status(&client).await?;
                }
            },
            Commands::Task { action } => match action {
                TaskCommands::Create(args) => {
                    handle_task_create(
                        &client,
                        &args.title,
                        args.desc.as_deref(),
                        args.task_type.as_deref(),
                        args.priority.as_deref(),
                        args.agent.as_deref(),
                        cli.dangerously_skip_permissions,
                    )
                    .await?;
                }
                TaskCommands::List { limit, status } => {
                    handle_task_list(&client, limit, status.as_deref()).await?;
                }
                TaskCommands::Inspect { id } => {
                    handle_task_inspect(&client, &id).await?;
                }
                TaskCommands::Approve { id } => {
                    client.approve_task(&id).await?;
                    println!("\n{} Tarefa {} aprovada com sucesso.\n", "✓".green().bold(), id.cyan());
                }
                TaskCommands::Reject { id } => {
                    client.reject_task(&id).await?;
                    println!("\n{} Tarefa {} rejeitada pelo usuário.\n", "✓".yellow().bold(), id.cyan());
                }
                TaskCommands::Cancel { id } => {
                    client.cancel_task(&id).await?;
                    println!("\n{} Solicitação de cancelamento enviada para {}.\n", "✓".yellow().bold(), id.cyan());
                }
            },
            Commands::Config => {
                println!("{}", BANNER.cyan().bold());
                handle_config(cli.dangerously_skip_permissions);
            }
            Commands::Addagents => {
                println!("\n{}", "🔑 Assistente de Contas & Agentes (Login)".bold().cyan());
                println!("Comandos de autenticação oficial dos provedores:\n");
                println!("• Google Antigravity: {}", "agy auth".green().bold());
                println!("• Claude Code CLI:    {}", "claude login".green().bold());
                println!("• OpenAI Codex CLI:   {}", "codex login".green().bold());
                println!("• OpenCode CLI:       {}", "opencode auth".green().bold());
                println!("\nOu gerencie e configure quais agentes usar no Dashboard: {}", "http://localhost:3333".cyan().underline());
                println!();
            }
            Commands::Dashboard { port } => {
                let url = format!("http://localhost:{}", port);
                println!(
                    "\n{} {}\n",
                    "🌐 Abrindo CoAgent Web Dashboard no navegador:".bold().cyan(),
                    url.underline().bold()
                );
                #[cfg(target_os = "windows")]
                {
                    let _ = std::process::Command::new("cmd").args(["/c", "start", &url]).spawn();
                }
            }
        }
        return Ok(());
    }

    // Modo Print não-interativo (-p / --print)
    if cli.print && !cli.prompt.is_empty() {
        let goal = cli.prompt.join(" ");
        let _ = client.ensure_backend_running().await;
        let res = client.execute_objective(&goal, true).await?;
        println!("{}", serde_json::to_string_pretty(&res)?);
        return Ok(());
    }

    // Comportamento Padrão: Entra na TUI interativa nativa em Rust estilo Claude Code
    let initial_prompt = if !cli.prompt.is_empty() {
        Some(cli.prompt.join(" "))
    } else {
        None
    };

    run_interactive_tui(client, initial_prompt, cli.dangerously_skip_permissions).await?;
    Ok(())
}
