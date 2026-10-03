import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** A path relative to this file */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  // GitHub Pages serves the site from /evem/ (pages.yml sets DEMO_BASE)
  base: process.env['DEMO_BASE'] ?? '/',
  plugins: [tailwindcss()],
  resolve: {
    // The library's own sources, under the package's published names, so the demo's code reads like users' code
    alias: [
      { find: /^@jcfigueiredo\/evem$/, replacement: here('../src/index.ts') },
      { find: /^@jcfigueiredo\/evem\/websocket$/, replacement: here('../src/websocket/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse$/, replacement: here('../src/sse/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse\/server$/, replacement: here('../src/sse/server.ts') }
    ]
  },
  server: {
    // The local server switch: SSE scenarios read /events from examples/python/server.py (or the Flask / FastAPI
    // apps, or any SSE server) on port 8000, with the same URL their code uses with the simulated server
    proxy: { '/events': 'http://127.0.0.1:8000' }
  },
  build: {
    outDir: here('dist'),
    emptyOutDir: true,
    rolldownOptions: { input: { main: here('index.html'), playground: here('playground/index.html') } }
  }
});
