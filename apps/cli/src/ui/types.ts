export interface CommandSuggestion {
  name: string;
  description: string;
  category?: string;
}

export const SLASH_COMMANDS: CommandSuggestion[] = [
  {
    name: '/help',
    description: 'Exibe a lista de todos os comandos disponíveis',
  },
  {
    name: '/addagents',
    description: 'Assistente para conectar e fazer login nas contas (Google, Claude, Codex, OpenCode)',
  },
  {
    name: '/dashboard',
    description: 'Abre o Painel Web (http://localhost:3333) para ligar/desligar agentes',
  },
  {
    name: '/agents',
    description: 'Lista todos os agentes registrados e capacidades ativas',
  },
  {
    name: '/status',
    description: 'Exibe uso dos 4 slots paralelos de concorrência e tarefas',
  },
  {
    name: '/tasks',
    description: 'Lista as tarefas recentes e seus status no sistema',
  },
  {
    name: '/test',
    description: 'Roda teste de validação rápida Hello World nos agentes',
  },
  {
    name: '/advise',
    description: 'Consulta o CoAgent Advisor sênior para conselhos técnicos',
  },
  {
    name: '/review',
    description: 'Roda o Ultrareview crítico nas alterações do Git diff',
  },
  {
    name: '/clear',
    description: 'Limpa a tela do terminal mantendo a sessão',
  },
  {
    name: '/exit',
    description: 'Encerra a sessão interativa do CoAgent',
  },
];
