/// <reference types="vitest" />

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // tsconfig.json's ~/ path, for tests
      { find: /^~\//, replacement: source('') },
      // The package's entry points, for code that imports them by name (the demo)
      { find: /^@jcfigueiredo\/evem$/, replacement: source('index.ts') },
      { find: /^@jcfigueiredo\/evem\/websocket$/, replacement: source('websocket/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse$/, replacement: source('sse/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse\/server$/, replacement: source('sse/server.ts') }
    ]
  },
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['html']
    }
  }
});
