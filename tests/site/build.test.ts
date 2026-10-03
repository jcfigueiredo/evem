import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../', import.meta.url));

it('builds the showcase and the playground for GitHub Pages, with the real library inside', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'evem-site-'));
  try {
    execFileSync(
      process.execPath,
      [
        join(repo, 'node_modules/vite/bin/vite.js'),
        'build',
        '--config',
        join(repo, 'demo/vite.config.ts'),
        '--outDir',
        outDir,
        '--emptyOutDir',
        '--logLevel',
        'error'
      ],
      { cwd: repo, env: { ...process.env, DEMO_BASE: '/evem/' }, stdio: 'pipe' }
    );
    for (const page of ['index.html', 'playground/index.html']) {
      const html = readFileSync(join(outDir, page), 'utf8');
      expect(html).toMatch(/src="\/evem\/assets\/[^"]+\.js"/);
      // The footer says which library code the site runs (siteStamp.ts)
      expect(html, page).not.toContain('%EVEM_');
    }
    expect(readFileSync(join(outDir, 'index.html'), 'utf8')).toMatch(/commit\/[0-9a-f]{40}">[0-9a-f]{7}</);
    const scripts = readdirSync(join(outDir, 'assets'))
      .filter(file => file.endsWith('.js'))
      .map(file => readFileSync(join(outDir, 'assets', file), 'utf8'))
      .join('\n');
    // A message from src/eventEmitter.ts: the pages run the library, not a copy of it
    expect(scripts).toContain('Max recursion depth of');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}, 120_000);
