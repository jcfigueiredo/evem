import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const demo = new URL('../../demo/', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(demo, path), 'utf8');

/** Every TypeScript file under demo/src */
function sources(dir = 'src'): string[] {
  return readdirSync(join(demo, dir)).flatMap(name => {
    const path = join(dir, name);
    if (statSync(join(demo, path)).isDirectory()) return sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('the pages', () => {
  it.each([
    ['index.html', './src/styles.css'],
    ['playground/index.html', '../src/styles.css']
  ])('%s links the stylesheet in its head, so it never paints without it', (page, href) => {
    const head = read(page).split('</head>')[0]!;
    expect(head).toContain(`<link rel="stylesheet" href="${href}" />`);
  });

  it('loads the stylesheet only from the pages: a script importing it paints the page unstyled first on the dev server', () => {
    const importers = sources().filter(path => /import\s+['"][^'"]*styles\.css['"]/.test(read(path)));
    expect(importers).toEqual([]);
  });
});
