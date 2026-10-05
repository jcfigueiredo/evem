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
      { find: /^@jcfigueiredo\/evem\/sse\/server$/, replacement: source('sse/server.ts') },
      { find: /^@jcfigueiredo\/evem\/dom$/, replacement: source('dom/index.ts') },
      { find: /^@jcfigueiredo\/evem\/alpine$/, replacement: source('alpine/index.ts') }
    ]
  },
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The library's code, which the package ships (the demo's DOM code is checked in a browser, not by tests)
      include: ['src/**'],
      // Vitest 4 matches include anywhere in the path, so demo/src/ would count too
      exclude: ['demo/**'],
      // The HTML report goes to coverage/; the summary prints when the run ends
      reporter: ['html', 'text-summary']
    }
  }
});
