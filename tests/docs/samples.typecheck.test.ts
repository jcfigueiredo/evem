import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extractCodeBlocks,
  isFragment,
  readDoc,
  TYPESCRIPT_DOCS,
  TYPESCRIPT_LANGUAGES,
  type TypeScriptDoc
} from './codeBlocks';
import { typeCheck, type VirtualFile } from './typeCheck';

const prelude = (name: string) => fileURLToPath(new URL(`./preludes/${name}`, import.meta.url));

/** What each document's samples use without defining (see the comments in preludes/) */
const PRELUDES: Record<TypeScriptDoc, string[]> = {
  'README.md': [prelude('readme.d.ts')],
  // The guide pages came from the README, and use what its prelude declares
  'docs/guide/events.md': [prelude('readme.d.ts')],
  'docs/guide/subscriptions.md': [prelude('readme.d.ts')],
  'docs/guide/middleware.md': [prelude('readme.d.ts')],
  'docs/guide/errors.md': [prelude('readme.d.ts')],
  'docs/guide/history-and-debugging.md': [prelude('readme.d.ts')],
  'docs/guide/typed-events.md': [],
  'docs/examples.md': [prelude('examples.d.ts')],
  'docs/websocket-adapter.md': [],
  'docs/websocket-server-events.md': [prelude('websocket-server-events.d.ts'), prelude('react.d.ts')],
  'docs/sse-adapter.md': [],
  'docs/sse-python.md': [prelude('sse-python.d.ts')],
  'docs/dom.md': [],
  'docs/alpine.md': []
};

describe.each(TYPESCRIPT_DOCS)('TypeScript samples in %s', file => {
  it('type-check against the package API', () => {
    const blocks = extractCodeBlocks(readDoc(file), file, TYPESCRIPT_LANGUAGES).filter(block => !isFragment(block));
    const slug = file.replace(/[^a-z0-9]+/gi, '_');
    const documentLine = new Map<string, number>();
    const files: VirtualFile[] = blocks.map(block => {
      const path = `__docs_check__/${slug}_L${block.line}.${block.language === 'tsx' ? 'tsx' : 'ts'}`;
      documentLine.set(path, block.line);
      return { path, code: block.code };
    });

    const problems = typeCheck(files, PRELUDES[file]).map(diagnostic => {
      const firstLine = documentLine.get(diagnostic.path);
      const location =
        firstLine === undefined
          ? `${diagnostic.path}:${diagnostic.line}`
          : `${file}:${firstLine + diagnostic.line - 1}`;
      return `${location}: TS${diagnostic.code} ${diagnostic.message}`;
    });
    expect(problems).toEqual([]);
  }, 60_000);
});
