import { describe, expect, it } from 'vitest';
import {
  extractCodeBlocks,
  FRAGMENT_MARKER,
  isFragment,
  readDoc,
  TYPESCRIPT_DOCS,
  TYPESCRIPT_LANGUAGES
} from './codeBlocks';

const markdown = [
  '# Title', // 1
  '', // 2
  '```typescript', // 3
  'const a = 1;', // 4
  'const b = 2;', // 5
  '```', // 6
  '```bash', // 7
  '```typescript', // 8: inside the bash block, so not a new block
  '```', // 9: closes the bash block
  '```ts title="example.ts"', // 10
  'const c = 3;', // 11
  '```' // 12
].join('\n');

describe('extractCodeBlocks', () => {
  it('returns the blocks in the given languages, with the line of their first line of code', () => {
    expect(extractCodeBlocks(markdown, 'doc.md', ['typescript', 'ts'])).toEqual([
      { file: 'doc.md', language: 'typescript', line: 4, code: 'const a = 1;\nconst b = 2;' },
      { file: 'doc.md', language: 'ts', line: 11, code: 'const c = 3;' }
    ]);
  });

  it('skips blocks in other languages whole, fences inside them included', () => {
    expect(extractCodeBlocks(markdown, 'doc.md', ['bash'])).toEqual([
      { file: 'doc.md', language: 'bash', line: 8, code: '```typescript' }
    ]);
  });

  it('reads documents with CRLF line endings', () => {
    const crlf = markdown.replace(/\n/g, '\r\n');
    expect(extractCodeBlocks(crlf, 'doc.md', ['typescript']).map(block => block.code)).toEqual([
      'const a = 1;\nconst b = 2;'
    ]);
  });

  it('throws for a code fence that is never closed, with the document and line', () => {
    expect(() => extractCodeBlocks('text\n```typescript\nconst a = 1;\n', 'doc.md', ['typescript'])).toThrow(
      'doc.md:2: code fence is never closed'
    );
  });
});

describe('isFragment', () => {
  it('is true only for blocks that contain the fragment marker', () => {
    const block = { file: 'doc.md', language: 'ts', line: 1, code: 'const a = 1;' };
    expect(isFragment(block)).toBe(false);
    expect(isFragment({ ...block, code: `${FRAGMENT_MARKER}\n{ reconnect: true }` })).toBe(true);
  });
});

describe('TYPESCRIPT_DOCS', () => {
  it.each(TYPESCRIPT_DOCS)('%s has TypeScript samples (a renamed fence language would hide them)', file => {
    expect(extractCodeBlocks(readDoc(file), file, TYPESCRIPT_LANGUAGES).length).toBeGreaterThan(0);
  });
});
