# Arquitetura Técnica — CoAgent (Framework de Orquestração Multiagente)

## 1. Visão Técnica Geral
O **CoAgent** é um framework modular e desacoplado de orquestração multiagente projetado para coordenar tarefas complexas de engenharia de software distribuídas entre múltiplos agentes de IA de ponta (Google Antigravity, Claude Code, OpenAI Codex e OpenCode).

### Princípios Fundamentais
1. **Agnóstico de Provedor**: O núcleo (`core`) não possui conhecimento direto sobre comandos ou APIs específicas da Anthropic, Google ou OpenAI. Ele interage com agentes exclusivamente por meio de contratos padronizados (`AgentAdapter`).
2. **Isolamento e Tolerância a Falhas**: Falhas em um agente (como crash de CLI, timeout de rede ou exaustão de quota) não derrubam o orquestrador nem outros agentes em execução simultânea.
3. **Concorrência Controlada**: Suporte a execução concorrente paralela (padrão de 4 agentes simultâneos, configurável globalmente e por provedor) com filas priorizadas e prevenção ativa de starvation e deadlocks.
4. **Contexto Seletivo e Envelopamento de Mensagens**: Comunicação entre agentes orientada a mensagens tipadas e referências pontuais de contexto, prevenindo poluição de contexto e consumo excessivo de tokens.
5. **Segurança por Padrão (Least Privilege)**: Modos restritos de permissão (`read-only`, `workspace-write`, `danger-full-access`), validação estrita de caminhos de diretório e ponto de interrupção para aprovação humana em comandos destrutivos.
6. **Persistência Confiável**: Persistência ACID em SQLite nativo (`node:sqlite`), permitindo retomada e recuperação do estado de tarefas após interrupções inesperadas.

---

## 2. Diagrama de Arquitetura em Camadas

```mermaid
graph TD
    User["Usuário / CLI / Dashboard / MCP Client"]
    
    subgraph Apps ["Camada de Apresentação (Apps)"]
        CLI["coagent CLI (Commander.js)"]
        Dashboard["CoAgent Web Dashboard (Fastify + SSE)"]
        MCPServer["CoAgent MCP Server (JSON-RPC)"]
    end

    subgraph Core ["Núcleo de Orquestração (Packages Core / Orchestrator)"]
        Orchestrator["Orchestrator (Decomposição, Plano DAG & Síntese)"]
        TaskManager["Task Manager (Ciclo de Vida & Transições)"]
        Scheduler["Scheduler (Fila de Prioridade & Semáforo 4x)"]
        AgentRegistry["Agent Registry (Descoberta & Capacidades)"]
        ContextManager["Context Manager (Contexto Seletivo & Memória)"]
        MessageBus["Message Bus (Pub/Sub & Roteamento Tipado)"]
        PermissionManager["Permission Manager (Políticas de Segurança)"]
        SessionManager["Session Manager (Retomada & Sessões)"]
    end

    subgraph Storage ["Camada de Persistência (Package Storage)"]
        SQLiteRepo["SQLite Repository (node:sqlite Nativo)"]
        TaskStore[("Tabela Tasks")]
        MessageStore[("Tabela Messages")]
        SessionStore[("Tabela Sessions")]
        AuditStore[("Tabela Audit Logs")]
    end

    subgraph Adapters ["Camada de Adaptadores de Agentes (Package Adapters)"]
        AdapterInterface["<<interface>> AgentAdapter"]
        AGYAdapter["AgyAdapter (Google Antigravity CLI)"]
        ClaudeAdapter["ClaudeCodeAdapter (Claude Code CLI)"]
        CodexAdapter["CodexAdapter (OpenAI Codex CLI)"]
        OpenCodeAdapter["OpenCodeAdapter (OpenCode CLI)"]
    end

    subgraph Execution ["Ambientes Locais de Execução de Agentes"]
        AGYExe["agy.exe (stream-json / acp)"]
        ClaudeExe["claude.exe (stream-json / print)"]
        CodexExe["codex.exe (exec --json)"]
        OpenCodeExe["opencode.ps1 / cmd (run --format json)"]
    end

    User --> CLI
    User --> Dashboard
    User --> MCPServer

    CLI --> Orchestrator
    Dashboard --> Orchestrator
    MCPServer --> Orchestrator

    Orchestrator --> TaskManager
    Orchestrator --> Scheduler
    Orchestrator --> AgentRegistry
    Orchestrator --> ContextManager

    TaskManager --> Storage
    Scheduler --> TaskManager
    Scheduler --> AdapterInterface

    AdapterInterface <|-- AGYAdapter
    AdapterInterface <|-- ClaudeAdapter
    AdapterInterface <|-- CodexAdapter
    AdapterInterface <|-- OpenCodeAdapter

    AGYAdapter --> AGYExe
    ClaudeAdapter --> ClaudeExe
    CodexAdapter --> CodexExe
    OpenCodeAdapter --> OpenCodeExe
```

---

## 3. Fluxo de Comunicação e Protocolo Entre Agentes

Cada agente secundário não envia chamadas desestruturadas no vácuo. Toda comunicação transita pelo `MessageBus` e é registrada com o envelope padronizado do protocolo:

```json
{
  "id": "msg_01HE78A9B2XYZ",
  "taskId": "task_plan_core_01",
  "correlationId": "corr_user_req_42",
  "sourceAgent": "claude-code",
  "targetAgent": "codex",
  "type": "REQUEST_REVIEW",
  "payload": {
    "gitDiff": "...",
    "filesChanged": ["packages/core/src/task-manager.ts"],
    "reviewCriteria": ["type-safety", "performance", "edge-cases"]
  },
  "contextRef": "ctx_diff_01HE78",
  "timestamp": "2026-11-11T16:00:00.000Z",
  "requiresResponse": true
}
```

### Cenário Típico de Colaboração (4 Agentes):
1. **Orchestrator** recebe o objetivo do usuário e decompõe em subtarefas:
   - Tarefa 1 (Pesquisa/Arquitetura): Delegada ao **Google Antigravity (AGY)**
   - Tarefa 2 (Implementação TypeScript): Delegada ao **Claude Code**
   - Tarefa 3 (Otimização de Algoritmo / Geração de Testes): Delegada ao **OpenAI Codex**
   - Tarefa 4 (Refatoração de Infra / Build): Delegada ao **OpenCode**
2. **DAG de Dependências**:
   - Tarefas 2, 3 e 4 podem rodar em paralelo se independentes, ou sequenciadas por dependência de dados (`dependsOn: ['task_1']`).
3. **Agregação e Validação**:
   - Ao final, um agente validador independente (ex.: Codex revisando código do Claude Code) garante que o código cumpra as especificações antes do encerramento da tarefa principal.

---

## 4. Estratégia de Concorrência e Semáforo (4 Agentes em Paralelo)

### Modelo de Execução
- **Semáforo Global Assíncrono**: `ConcurrencyController` com limite global configurável (padrão `maxParallelism = 4`).
- **Limites por Provedor**: Impede que 4 tarefas simultâneas atinjam simultaneamente o mesmo CLI caso haja limitação de taxa de API (ex: `maxPerProvider: { 'claude-code': 2, 'codex': 2, 'agy': 2, 'opencode': 2 }`).
- **Controle de Cancelamento**: Cada tarefa em execução recebe um `AbortSignal`. Quando o usuário cancela via CLI (`coagent task cancel <id>`), o processo filho (`ChildProcess`) associado ao CLI é encerrado graciosamente (SIGTERM -> SIGKILL se timeout de 5s).
- **Timeouts e Retry com Backoff**: Cada tarefa possui `timeoutMs` configurável. Erros transitórios de rede ou lock temporário acionam retry exponencial com limite máximo de tentativas configurável (ex.: 3).

---

## 5. Estratégia de Persistência e Recuperabilidade
- SQLite via `node:sqlite` nativo (módulo oficial padrão do Node.js v22/24).
- Modo WAL (Write-Ahead Logging) habilitado para leitura concorrente rápida e integridade em gravações.
- Esquema de tabelas:
  - `tasks`: armazena `id`, `parent_task_id`, `title`, `description`, `status`, `assigned_agent`, `priority`, `depends_on`, `result`, `error`, `created_at`, `updated_at`.
  - `messages`: histórico auditável de cada mensagem trafegada entre agentes.
  - `sessions`: sessões de continuidade de cada CLI subordinado para permitir retoma (`--continue`, `--resume`).
  - `audit_events`: registro de segurança (comandos de terminal emitidos, arquivos tocados, decisões do orquestrador).
