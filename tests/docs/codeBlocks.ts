import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root, with a trailing separator */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Documents whose TypeScript samples are type-checked, relative to the repository root */
export const TYPESCRIPT_DOCS = [
  'README.md',
  'docs/guide/events.md',
  'docs/guide/subscriptions.md',
  'docs/guide/middleware.md',
  'docs/guide/errors.md',
  'docs/guide/history-and-debugging.md',
  'docs/guide/typed-events.md',
  'docs/examples.md',
  'docs/websocket-adapter.md',
  'docs/websocket-server-events.md',
  'docs/sse-adapter.md',
  'docs/sse-python.md',
  'docs/dom.md',
  'docs/alpine.md'
] as const;

export type TypeScriptDoc = (typeof TYPESCRIPT_DOCS)[number];

/** Fence languages that hold TypeScript */
export const TYPESCRIPT_LANGUAGES = ['typescript', 'ts', 'tsx'] as const;

/** A comment that marks a sample as deliberately incomplete, so the docs checks skip it */
export const FRAGMENT_MARKER = '// docs-check: fragment';

export interface CodeBlock {
  /** Document path relative to the repository root */
  file: string;
  /** The fence's language: the first word of its info string */
  language: string;
  /** 1-based line of the block's first line of code in the document */
  line: number;
  code: string;
}

/** A document's text, relative to the repository root, with LF line endings */
export function readDoc(file: string): string {
  return readFileSync(join(REPO_ROOT, file), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * The fenced code blocks of a Markdown document whose language is one of `languages`.
 * Blocks in other languages are skipped whole, so a fence-like line inside them isn't read as a new block.
 * Throws for a fence that is never closed.
 */
export function extractCodeBlocks(markdown: string, file: string, languages: readonly string[]): CodeBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: CodeBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const opening = /^```(\S*)/.exec(lines[index]!);
    if (!opening) continue;
    const first = index + 1;
    let closing = first;
    while (closing < lines.length && !/^```\s*$/.test(lines[closing]!)) closing++;
    if (closing === lines.length) {
      throw new Error(`${file}:${index + 1}: code fence is never closed`);
    }
    const language = opening[1]!;
    if (languages.includes(language)) {
      blocks.push({ file, language, line: first + 1, code: lines.slice(first, closing).join('\n') });
    }
    index = closing;
  }
  return blocks;
}

export function isFragment(block: CodeBlock): boolean {
  return block.code.includes(FRAGMENT_MARKER);
}
