import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  cwd: string;
  dangerBypass: boolean;
  slotsUsed: number;
  maxSlots: number;
}

export const Header: React.FC<HeaderProps> = ({ cwd, dangerBypass, slotsUsed, maxSlots }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {'  ██████╗ ██████╗  █████╗  ██████╗ ███████╗███╗   ██╗████████╗\n'}
        {' ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝\n'}
        {' ██║     ██║   ██║███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   \n'}
        {' ██║     ██║   ██║██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   \n'}
        {' ╚██████╗╚██████╔╝██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   \n'}
        {'  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   '}
      </Text>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
        marginTop={0}
      >
        <Box justifyContent="space-between">
          <Text bold color="white">
            CoAgent <Text dimColor color="white">(v1.0.0 • Multiagent Engine)</Text>
          </Text>
          <Text color={dangerBypass ? 'red' : 'green'}>
            {dangerBypass ? '⚠️  Dangerously Skip Permissions [ATIVO]' : '🛡️  Workspace-Write'}
          </Text>
        </Box>

        <Box marginTop={0}>
          <Text dimColor>Diretório: </Text>
          <Text color="cyan">{cwd}</Text>
        </Box>

        <Box marginTop={0}>
          <Text dimColor>Slots de Execução: </Text>
          <Text color="green" bold>{slotsUsed}/{maxSlots} ativos</Text>
          <Text dimColor>  •  Memória: </Text>
          <Text color="magenta">COAGENT.md [Ativa]</Text>
        </Box>

        <Box marginTop={0}>
          <Text dimColor>Agentes Conectados: </Text>
          <Text color="green">● agy-1 (Pro Max) </Text>
          <Text color="yellow">● agy-2 (Flash) </Text>
          <Text color="blue">● claude-code </Text>
          <Text color="magenta">● codex </Text>
          <Text color="cyan">● opencode</Text>
        </Box>
      </Box>

      <Box marginTop={0}>
        <Text dimColor>
          Digite seu objetivo ou use <Text bold color="cyan">/</Text> para comandos (/help, /addagents, /dashboard, /test).
        </Text>
      </Box>
    </Box>
  );
};
