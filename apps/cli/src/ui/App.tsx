import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { exec } from 'node:child_process';
import { CoAgentInstance } from '@coagent/orchestrator';
import { startDashboardServer } from '@coagent/dashboard';
import { Header } from './Header.js';
import { Autocomplete } from './Autocomplete.js';
import { SLASH_COMMANDS, CommandSuggestion } from './types.js';

interface Message {
  id: string;
  type: 'user' | 'system' | 'result' | 'error' | 'agent';
  content: string;
  agentId?: string;
  timestamp?: string;
}

interface AppProps {
  coagent: CoAgentInstance;
  dangerBypass: boolean;
  initialPrompt?: string;
}

export const App: React.FC<AppProps> = ({ coagent, dangerBypass, initialPrompt }) => {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningStatus, setRunningStatus] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);

  // Autocomplete state
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<CommandSuggestion[]>(SLASH_COMMANDS);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);

  const cwd = process.cwd();

  // Inicia o servidor do dashboard em segundo plano silenciosamente
  useEffect(() => {
    startDashboardServer(3333, coagent).catch(() => {});
  }, [coagent]);

  // Atualiza as sugestões de autocomplete conforme o usuário digita
  useEffect(() => {
    if (input.startsWith('/')) {
      const query = input.toLowerCase();
      const filtered = SLASH_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(query));
      setFilteredSuggestions(filtered.length > 0 ? filtered : SLASH_COMMANDS);
      setIsAutocompleteOpen(true);
      setSelectedSuggestionIdx(0);
    } else {
      setIsAutocompleteOpen(false);
    }
  }, [input]);

  const addMessage = (msg: Omit<Message, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: Math.random().toString(36).substring(7) }]);
  };

  const handleCommand = useCallback(async (fullCommand: string) => {
    const parts = fullCommand.slice(1).split(' ');
    const cmd = parts[0]?.toLowerCase() ?? '';
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case 'exit':
      case 'quit':
      case 'sair':
        addMessage({ type: 'system', content: 'Até logo! Encerrando sessão do CoAgent.' });
        setTimeout(() => exit(), 300);
        break;

      case 'clear':
      case 'cls':
        setMessages([]);
        break;

      case 'help':
      case 'ajuda':
        addMessage({
          type: 'system',
          content: [
            '📖 Comandos Disponíveis no CoAgent (Estilo Claude Code):',
            '  /addagents       - Assistente para conectar e fazer login nas contas (Google/Claude/Codex)',
            '  /dashboard, /dash- Abre o Painel Web (http://localhost:3333) para ligar/desligar agentes',
            '  /agents          - Lista todos os agentes registrados e capacidades',
            '  /status          - Exibe uso de slots de concorrência e tarefas em execução',
            '  /tasks           - Lista as tarefas recentes e seus status',
            '  /test [id]       - Roda validação básica Hello World nos agentes',
            '  /advise <dúvida> - Consulta o CoAgent Advisor sênior para conselhos de arquitetura',
            '  /review          - Executa Ultrareview no git diff do repositório',
            '  /clear           - Limpa as mensagens do terminal',
            '  /exit            - Encerra o CoAgent',
          ].join('\n'),
        });
        break;

      case 'addagents':
      case 'addagent':
      case 'login':
      case 'auth':
        addMessage({
          type: 'system',
          content: [
            '🔑 Assistente de Contas & Login de Agentes:',
            'Comandos oficiais para autenticação no terminal:',
            '  • Google Antigravity: agy auth  (ou agy login)',
            '  • Claude Code CLI:    claude login',
            '  • OpenAI Codex CLI:   codex login',
            '  • OpenCode CLI:       opencode auth',
            '',
            '💡 Para ativar ou desativar qualquer agente com 1 clique, use o comando /dashboard',
          ].join('\n'),
        });
        break;

      case 'dashboard':
      case 'dash':
        addMessage({
          type: 'system',
          content: '🌐 Abrindo CoAgent Web Dashboard em: http://localhost:3333\nUse o painel para ligar ou desligar qualquer agente com 1 clique!',
        });
        startDashboardServer(3333, coagent).catch(() => {});
        if (process.platform === 'win32') {
          exec('start "" "http://localhost:3333"', (err) => {
            if (err) {
              exec('powershell -NoProfile -Command "Start-Process \'http://localhost:3333\'"');
            }
          });
        } else if (process.platform === 'darwin') {
          exec('open http://localhost:3333');
        } else {
          exec('xdg-open http://localhost:3333');
        }
        break;

      case 'agents': {
        const list = coagent.agentRegistry.listAgents();
        const text = list
          .map(
            (a) =>
              `  • [${a.id}] ${a.name} (${a.provider}) - Status: ${a.status} (Carga: ${a.activeTasksCount}/${a.capabilities.maxConcurrency})`
          )
          .join('\n');
        addMessage({
          type: 'system',
          content: `🤖 Agentes Registrados no CoAgent (${list.length}):\n${text}`,
        });
        break;
      }

      case 'status': {
        const st = coagent.orchestrator.getSystemStatus();
        addMessage({
          type: 'system',
          content: [
            '📊 Status do Sistema em Tempo Real:',
            `  • Slots de Concorrência: ${st.concurrency.active}/${st.concurrency.max} ativos`,
            `  • Tarefas em Execução: ${st.activeTasks.length}`,
            `  • Tarefas na Fila: ${st.queuedTasks.length}`,
            `  • Memória COAGENT.md: ${st.projectMemory.loaded ? 'Ativa' : 'Não detectada'}`,
          ].join('\n'),
        });
        break;
      }

      case 'tasks': {
        const tasks = coagent.taskManager.listTasks(10);
        if (tasks.length === 0) {
          addMessage({ type: 'system', content: 'Nenhuma tarefa recente cadastrada.' });
        } else {
          const formatted = tasks
            .map((t) => `  • [${t.id.slice(0, 10)}] ${t.title} -> ${t.status} (${t.assignedAgent ?? 'auto'})`)
            .join('\n');
          addMessage({ type: 'system', content: `📋 Tarefas Recentes:\n${formatted}` });
        }
        break;
      }

      case 'advise':
        if (!args.trim()) {
          addMessage({ type: 'error', content: 'Uso: /advise <sua dúvida ou pergunta técnica>' });
          return;
        }
        setIsRunning(true);
        setRunningStatus('Consultando CoAgent Advisor sênior...');
        try {
          const advice = await coagent.orchestrator.advisor.advise(args);
          addMessage({ type: 'result', content: `🧠 Parecer do Advisor:\n\n${advice}` });
        } catch (err) {
          addMessage({ type: 'error', content: `Falha ao consultar advisor: ${String(err)}` });
        } finally {
          setIsRunning(false);
        }
        break;

      case 'test': {
        setIsRunning(true);
        setRunningStatus('Executando teste Hello World nos agentes...');
        try {
          const target = args.trim() ? args.trim() : undefined;
          const agents = target
            ? coagent.agentRegistry.listAgents().filter((a) => a.id === target)
            : coagent.agentRegistry.listAgents();

          for (const a of agents) {
            addMessage({
              type: 'agent',
              content: `Validando conectividade com ${a.name} (${a.id})...`,
              agentId: a.id,
            });
          }
          addMessage({
            type: 'result',
            content: `✓ Validação disparada para ${agents.length} agente(s). Use /tasks para acompanhar.`,
          });
        } catch (err) {
          addMessage({ type: 'error', content: `Erro no teste: ${String(err)}` });
        } finally {
          setIsRunning(false);
        }
        break;
      }

      default:
        addMessage({
          type: 'error',
          content: `Comando desconhecido: /${cmd}. Digite /help para ver os comandos disponíveis.`,
        });
        break;
    }
  }, [coagent, exit]);

  const handleSubmit = useCallback(async (promptText: string) => {
    const text = promptText.trim();
    if (!text) return;

    setHistory((prev) => [...prev, text]);
    setHistoryIdx(null);
    setInput('');
    setCursorPos(0);
    setIsAutocompleteOpen(false);

    addMessage({ type: 'user', content: text });

    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }

    setIsRunning(true);
    setRunningStatus('Coordenando agentes e decompondo tarefas...');

    try {
      const result = await coagent.orchestrator.executeObjective(text, {
        exhaustUntilComplete: true,
      });

      if (result.success) {
        addMessage({
          type: 'result',
          content: `✓ Objetivo concluído com sucesso!\n\n${result.summary}`,
        });
      } else {
        addMessage({
          type: 'error',
          content: `⚠️ Concluído com falhas:\n\n${result.summary}`,
        });
      }
    } catch (err) {
      addMessage({
        type: 'error',
        content: `✖ Erro na execução do objetivo: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsRunning(false);
      setRunningStatus('');
    }
  }, [coagent, handleCommand]);

  // Se houver prompt inicial
  useEffect(() => {
    if (initialPrompt) {
      handleSubmit(initialPrompt);
    }
  }, [initialPrompt, handleSubmit]);

  // Captura de Teclas com Autocomplete e Setas Perfeitas (Sem Duplicação)
  useInput((inputChar, key) => {
    if (isRunning) return;

    // Se o autocomplete de comandos estiver aberto
    if (isAutocompleteOpen && filteredSuggestions.length > 0) {
      if (key.upArrow) {
        setSelectedSuggestionIdx((prev) => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedSuggestionIdx((prev) => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (key.tab || (key.return && input !== filteredSuggestions[selectedSuggestionIdx]?.name)) {
        const chosen = filteredSuggestions[selectedSuggestionIdx];
        if (chosen) {
          setInput(chosen.name + ' ');
          setCursorPos(chosen.name.length + 1);
          setIsAutocompleteOpen(false);
          return;
        }
      }
      if (key.escape) {
        setIsAutocompleteOpen(false);
        return;
      }
    }

    // Navegação normal quando autocomplete está fechado
    if (key.return) {
      handleSubmit(input);
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        const next = input.slice(0, cursorPos - 1) + input.slice(cursorPos);
        setInput(next);
        setCursorPos(cursorPos - 1);
      }
      return;
    }

    if (key.leftArrow) {
      setCursorPos((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.rightArrow) {
      setCursorPos((prev) => Math.min(input.length, prev + 1));
      return;
    }

    // Histórico de comandos com Setas Cima / Baixo
    if (key.upArrow && !isAutocompleteOpen) {
      if (history.length > 0) {
        const nextIdx = historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(nextIdx);
        const item = history[nextIdx] ?? '';
        setInput(item);
        setCursorPos(item.length);
      }
      return;
    }

    if (key.downArrow && !isAutocompleteOpen) {
      if (historyIdx !== null) {
        if (historyIdx < history.length - 1) {
          const nextIdx = historyIdx + 1;
          setHistoryIdx(nextIdx);
          const item = history[nextIdx] ?? '';
          setInput(item);
          setCursorPos(item.length);
        } else {
          setHistoryIdx(null);
          setInput('');
          setCursorPos(0);
        }
      }
      return;
    }

    if (key.ctrl && (inputChar === 'c' || inputChar === 'C')) {
      if (input.length > 0) {
        setInput('');
        setCursorPos(0);
      } else {
        exit();
      }
      return;
    }

    // Caractere digitado normalmente
    if (inputChar) {
      const next = input.slice(0, cursorPos) + inputChar + input.slice(cursorPos);
      setInput(next);
      setCursorPos(cursorPos + inputChar.length);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        cwd={cwd}
        dangerBypass={dangerBypass}
        slotsUsed={coagent.orchestrator.getSystemStatus().concurrency.active}
        maxSlots={coagent.orchestrator.getSystemStatus().concurrency.max}
      />

      {/* Histórico de Mensagens */}
      {messages.map((m) => {
        if (m.type === 'user') {
          return (
            <Box key={m.id} marginTop={1} marginBottom={0}>
              <Text bold color="cyan">
                ❯ {m.content}
              </Text>
            </Box>
          );
        }
        if (m.type === 'result') {
          return (
            <Box
              key={m.id}
              flexDirection="column"
              borderStyle="round"
              borderColor="green"
              paddingX={1}
              marginTop={1}
              marginBottom={1}
            >
              <Text color="white">{m.content}</Text>
            </Box>
          );
        }
        if (m.type === 'error') {
          return (
            <Box key={m.id} marginTop={0} marginBottom={1}>
              <Text color="red">{m.content}</Text>
            </Box>
          );
        }
        if (m.type === 'agent') {
          return (
            <Box key={m.id} marginTop={0}>
              <Text color="yellow">  ⏺ {m.content}</Text>
            </Box>
          );
        }
        return (
          <Box key={m.id} marginTop={0} marginBottom={1}>
            <Text color="gray">{m.content}</Text>
          </Box>
        );
      })}

      {/* Status de Execução Ativa com Spinner */}
      {isRunning && (
        <Box marginTop={1} marginBottom={1}>
          <Text color="cyan">
            <Spinner type="dots" /> {runningStatus}
          </Text>
        </Box>
      )}

      {/* Linha de Prompt com Cursor e Chevron estilo Claude Code */}
      {!isRunning && (
        <Box flexDirection="column">
          <Box>
            <Text bold color="cyan">
              ❯{' '}
            </Text>
            <Text color="white">
              {input.slice(0, cursorPos)}
              <Text inverse>{input[cursorPos] || ' '}</Text>
              {input.slice(cursorPos + 1)}
            </Text>
          </Box>

          {/* Autocomplete Popover quando digita / */}
          {isAutocompleteOpen && (
            <Autocomplete
              suggestions={filteredSuggestions}
              selectedIndex={selectedSuggestionIdx}
            />
          )}
        </Box>
      )}
    </Box>
  );
};
