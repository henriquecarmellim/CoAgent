import React from 'react';
import { Box, Text } from 'ink';
import { CommandSuggestion } from './types.js';

interface AutocompleteProps {
  suggestions: CommandSuggestion[];
  selectedIndex: number;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({ suggestions, selectedIndex }) => {
  if (suggestions.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginTop={0}
      >
        <Text dimColor>Nenhum comando correspondente encontrado.</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginTop={0}
      marginBottom={0}
    >
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Comandos Sugeridos:
        </Text>
      </Box>

      {suggestions.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={item.name} justifyContent="space-between">
            <Box>
              <Text bold color={isSelected ? 'cyan' : 'white'}>
                {isSelected ? '❯ ' : '  '}
                {item.name}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor color={isSelected ? 'white' : 'gray'}>
                {item.description}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={0}>
        <Text dimColor color="gray">
          Pressione <Text bold color="cyan">↑/↓</Text> para navegar • <Text bold color="cyan">Tab</Text> ou <Text bold color="cyan">Enter</Text> para selecionar • <Text bold color="cyan">Esc</Text> para fechar
        </Text>
      </Box>
    </Box>
  );
};
