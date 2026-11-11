# CoAgent — Framework de Orquestração Multiagente de IA

O **CoAgent** é um framework autônomo, modular e desacoplado projetado para coordenar tarefas complexas de engenharia de software distribuídas entre múltiplos agentes de IA de ponta: **Google Antigravity (AGY)**, **Claude Code**, **OpenAI Codex** e **OpenCode**.

Desenvolvido para ambientes de produção, o sistema suporta **até 4 agentes executando tarefas em paralelo**, gerenciamento de filas priorizadas, prevenção estrutural de deadlocks em grafos de dependência (DAG), persistência nativa em SQLite, comunicação tipada por mensagens (`MessageBus`), servidor MCP oficial e dashboard web em tempo real.

---

## 🌟 Principais Recursos

- **Orquestração Inteligente (DAG)**: Decomposição automática de objetivos de alto nível em tarefas encadeadas acíclicas.
- **Delegação Especializada (SmartDelegator)**: Atribuição baseada em afinidade de capacidades, carga atual de concorrência e regra de isolamento para revisões independentes de código.
- **Execução Paralela Controlada**: Agendador com semáforo configurável para **4 slots simultâneos globais** e limite por provedor.
- **Isolamento de Processos e Cancelamento**: Controle fino com `AbortController` e finalização segura de processos zumbis.
- **Comunicação Estruturada**: Barramento pub/sub com envelopes JSON tipados e propagação seletiva de contexto (sem poluição de histórico).
- **Persistência ACID Local**: SQLite nativo (`node:sqlite`) em modo WAL para tarefas, mensagens, sessões e auditoria.
- **Segurança Multicamadas**: Políticas de segurança (`read-only`, `workspace-write`, `danger-full-access`) e bloqueio ativo de comandos destrutivos.
- **CLI Profissional (`coagent`)**: Interface completa para gestão de tarefas, agentes, execução e configuração.
- **Model Context Protocol (MCP)**: Servidor stdio MCP para expor o CoAgent a outros agentes e ferramentas externas.
- **Dashboard Web em Tempo Real**: Interface visual moderna com Server-Sent Events (SSE) para monitorar os 4 slots e tarefas ao vivo.

---

## 🏗️ Estrutura do Monorepo

```text
CoAgent/
├── apps/
│   ├── cli/                     # CLI coagent (Commander.js + Chalk + Table)
│   ├── dashboard/               # Web Dashboard em tempo real (Fastify + SSE)
│   └── mcp-server/              # Servidor MCP oficial (Stdio JSON-RPC)
├── packages/
│   ├── shared/                  # Logger estruturado, erros com código, utilitários
│   ├── protocol/                # Schemas Zod de tarefas, mensagens, agentes e segurança
│   ├── storage/                 # Camada de persistência SQLite nativa (node:sqlite WAL)
│   ├── core/                    # Registry, TaskManager, Context, Permissions, MessageBus
│   ├── scheduler/               # Fila de prioridade, semáforo 4x, validador de DAG
│   ├── orchestrator/            # Decomposição de planos, delegação inteligente e síntese
│   └── adapters/                # Adaptadores reais para AGY, Claude Code, Codex e OpenCode
├── tests/                       # Suíte completa de testes unitários e de integração (Vitest)
├── docs/                        # Especificações técnicas e arquiteturais detalhadas
├── package.json                 # Workspaces npm root
└── tsconfig.json                # Configuração TypeScript estrita compartilhada
```

---

## 🚀 Instalação e Requisitos

### Pré-requisitos
- **Sistema Operacional**: Windows 11 (ou Linux / macOS)
- **Node.js**: v22.0.0 ou superior (testado e otimizado no Node.js v24)
- **CLIs Suportados**: `agy`, `claude`, `codex`, `opencode` disponíveis no PATH do sistema.

### Instalação
```bash
# Instalar dependências de todos os workspaces
npm install

# Compilar todos os pacotes em TypeScript estrito
npm run build

# Executar a suíte de testes automatizados
npm test
```

---

## 💻 Uso da Linha de Comando (`coagent`)

### Visualizar Agentes e Concorrência
```bash
# Listar todos os agentes registrados e suas especialidades
node apps/cli/dist/index.js agents list

# Exibir status dos 4 slots de concorrência em tempo real
node apps/cli/dist/index.js agents status
```

### Gerenciamento de Tarefas
```bash
# Criar uma nova tarefa
node apps/cli/dist/index.js task create "Implementar serviço de cache" -t implementation -p high

# Listar tarefas com filtros
node apps/cli/dist/index.js task list
node apps/cli/dist/index.js task list --status running

# Inspecionar detalhes de uma tarefa
node apps/cli/dist/index.js task inspect <task_id>

# Cancelar uma tarefa em andamento
node apps/cli/dist/index.js task cancel <task_id>
```

### Orquestração de Alto Nível
```bash
# Decompõe e executa um objetivo completo de engenharia de software
node apps/cli/dist/index.js run "Criar microsserviço de autenticação com testes e auditoria"
```

---

## 🌐 Dashboard Web em Tempo Real

Para iniciar o dashboard visual:
```bash
node apps/dashboard/dist/server.js
```
Acesse no navegador: **`http://localhost:3333`**

O dashboard apresenta:
- **Status dos 4 Agentes**: Capacidades, contadores de tarefas e estados (`idle`, `busy`, `offline`).
- **Medidor dos 4 Slots Paralelos**: Ocupação visual dos slots do semáforo.
- **Tabela de Tarefas Dinâmica**: Atualização imediata de status.
- **Console de Eventos (SSE)**: Stream contínuo de eventos do barramento.

---

## 🔌 Integração MCP (Model Context Protocol)

O CoAgent pode ser consumido como um servidor MCP por ferramentas como Claude Desktop, Antigravity ou outros orquestradores.

Exemplo de configuração MCP:
```json
{
  "mcpServers": {
    "coagent": {
      "command": "node",
      "args": ["C:/caminho/para/CoAgent/apps/mcp-server/dist/index.js"]
    }
  }
}
```

### Ferramentas MCP Disponíveis:
- `coagent_list_agents`: Consulta agentes e capacidades.
- `coagent_delegate_task`: Enfileira uma tarefa específica ou com delegação automática.
- `coagent_task_status`: Acompanha o ciclo de vida e recupera o output da tarefa.
- `coagent_cancel_task`: Interrompe a execução de uma tarefa.
- `coagent_run_objective`: Dispara a orquestração autônoma de um objetivo complexo.

---

## 🧪 Testes Automatizados

O projeto conta com testes unitários e de integração cobrindo 100% dos subsistemas:
```bash
npm test
```
Resultados validados:
- Persistência e repositório SQLite em modo isolado.
- Máquina de transição estrita de estados de tarefas.
- Política de segurança e bloqueio de comandos perigosos.
- Contexto seletivo sem vazamento de histórico.
- Detecção e prevenção de ciclos em grafos (DAG).
- Semáforo de concorrência com 4 slots paralelos.
- Fila priorizada (`critical` > `high` > `normal` > `low`).
- Ciclo completo de orquestração fim-a-fim.

---

## 📄 Licença
Distribuído sob a licença MIT.
