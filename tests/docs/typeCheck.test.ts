import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { typeCheck } from './typeCheck';

// Building a program loads the DOM and ES libraries and src/, which takes a few seconds
const TIMEOUT = 30_000;

const scratch = mkdtempSync(join(tmpdir(), 'evem-typecheck-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function declarations(name: string, code: string): string {
  const path = join(scratch, name);
  writeFileSync(path, code);
  return path;
}

describe('typeCheck', () => {
  it(
    'accepts code that uses the package API correctly',
    () => {
      const code = [
        "import { EvEm } from '@jcfigueiredo/evem';",
        'const evem = new EvEm();',
        "evem.subscribe<{ id: number }>('order.created', order => console.log(order.id.toFixed()));"
      ].join('\n');
      expect(typeCheck([{ path: '__check__/valid.ts', code }])).toEqual([]);
    },
    TIMEOUT
  );

  it(
    'reports API misuse with the file, the line and the error code',
    () => {
      const code = [
        "import { EvEm } from '@jcfigueiredo/evem';",
        'const evem = new EvEm();',
        'evem.subscribe(42, () => {});'
      ].join('\n');
      expect(typeCheck([{ path: '__check__/misuse.ts', code }])).toEqual([
        expect.objectContaining({ path: '__check__/misuse.ts', line: 3, code: 2345 })
      ]);
    },
    TIMEOUT
  );

  it(
    'resolves every entry point of the package',
    () => {
      const code = [
        "import { EvEm } from '@jcfigueiredo/evem';",
        "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
        "import { SseHandler } from '@jcfigueiredo/evem/sse';",
        "import { formatSseMessage } from '@jcfigueiredo/evem/sse/server';",
        'const evem = new EvEm();',
        "new WebSocketHandler('wss://example.com', evem);",
        "new SseHandler('https://example.com/events', evem, { autoConnect: false });",
        "formatSseMessage({ event: 'tick', data: 1 });"
      ].join('\n');
      expect(typeCheck([{ path: '__check__/entry-points.ts', code }])).toEqual([]);
    },
    TIMEOUT
  );

  it(
    'checks each file as its own module',
    () => {
      const files = [
        { path: '__check__/first.ts', code: 'const shared = 1;' },
        { path: '__check__/second.ts', code: 'const shared = 2;' }
      ];
      expect(typeCheck(files)).toEqual([]);
    },
    TIMEOUT
  );

  it(
    'adds the given declaration files, e.g. globals a sample assumes',
    () => {
      const prelude = declarations('globals.d.ts', 'declare function placeholder(value: number): void;\n');
      expect(typeCheck([{ path: '__check__/uses-global.ts', code: 'placeholder(1);' }], [prelude])).toEqual([]);
      expect(typeCheck([{ path: '__check__/misuses-global.ts', code: "placeholder('one');" }], [prelude])).toEqual([
        expect.objectContaining({ line: 1, code: 2345 })
      ]);
    },
    TIMEOUT
  );

  it(
    'reports errors in the declaration files themselves',
    () => {
      const broken = declarations('broken.d.ts', 'declare const value: MissingType;\n');
      expect(typeCheck([{ path: '__check__/empty.ts', code: '' }], [broken])).toEqual([
        expect.objectContaining({ line: 1, code: 2304 })
      ]);
    },
    TIMEOUT
  );

  it(
    'parses .tsx files as JSX',
    () => {
      const jsx = declarations(
        'jsx.d.ts',
        'declare namespace JSX { interface Element {} interface IntrinsicElements { div: {} } }\n'
      );
      expect(typeCheck([{ path: '__check__/component.tsx', code: 'export const element = <div />;' }], [jsx])).toEqual(
        []
      );
    },
    TIMEOUT
  );
});
