import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@coagent/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@coagent/protocol': resolve(__dirname, 'packages/protocol/src/index.ts'),
      '@coagent/storage': resolve(__dirname, 'packages/storage/src/index.ts'),
      '@coagent/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@coagent/scheduler': resolve(__dirname, 'packages/scheduler/src/index.ts'),
      '@coagent/adapters': resolve(__dirname, 'packages/adapters/src/index.ts'),
      '@coagent/orchestrator': resolve(__dirname, 'packages/orchestrator/src/index.ts'),
    },
  },
});
