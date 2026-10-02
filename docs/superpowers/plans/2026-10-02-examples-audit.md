# Examples Audit Implementation Plan (Demo Revamp, Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every TypeScript sample in the README and the docs type-checks against the real API, the README's `// Output:` comments match real runs, the Flask and FastAPI examples are tested against a real `SseHandler`, and every documentation error the audit found is fixed — with all of it enforced by `pnpm check`.

**Architecture:** A new `tests/docs/` suite: `codeBlocks.ts` extracts fenced blocks from Markdown; `typeCheck.ts` type-checks blocks as in-memory TypeScript modules with the TypeScript compiler API, using the repo's `tsconfig.json` and mapping the package names to `src/`; `outputs.ts` runs README samples in-process against `src/` with Vitest fake timers and compares captured console output with the `// Output:` / `// Logs:` comments. Per-document preludes (`tests/docs/preludes/*.d.ts`) declare what each document's samples assume without defining. The existing Python test gains Flask and FastAPI cases.

**Tech Stack:** TypeScript 5 compiler API, Vitest 1.0 (`vi.useFakeTimers`, `vi.advanceTimersToNextTimerAsync`), Node 20+, Python 3 (optional, skipped when missing), `@types/ws` (new dev dependency, types only).

**Spec:** `docs/demo-revamp-design.md` — section "Phase 1: Examples audit".

## Global Constraints

- No runtime dependencies; new dependencies are dev-only (`@types/ws` here).
- Relative imports in `src/` use `.js` extensions; tests import `src/` without extensions (existing style, e.g. `../../src/eventEmitter`).
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas. `pnpm check` runs `format:check`, `typecheck`, tests and the package check.
- Library bug fixes: test first, one commit each, with an entry in CHANGELOG.md under `## 0.3.0 (unreleased)`.
- Documentation changes go in the same commit as the check or fix that needs them.
- The fragment marker is exactly `// docs-check: fragment`.
- Don't hard-code test counts in docs.
- Commit messages: subject line, a body that explains why, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A sample that never finishes** (awaits a promise nothing resolves): the output runner must fail with the sample's location after a bounded number of idle turns, not spin forever on `advanceTimersToNextTimerAsync()` (which returns immediately when no timers are pending). Test in Task 4.
2. **A sample with a repeating timer** (`setInterval`, a heartbeat): `runAllTimersAsync()` aborts after 10,000 timers; the runner must report that as a failure naming the sample, not crash the suite. Test in Task 4.
3. **Markdown variations**: CRLF line endings and fence info strings (```` ```typescript title="x" ````) must still be extracted; an unclosed fence must throw with the document and line. Tests in Task 1.
4. **An `// Output:` label with nothing after it**, or expectations that never match: the test must fail and print the missing expected line, the sample's location and the actual output. Tests in Task 4.
5. **A sample that throws or rejects**: reported with its document line and the error message, and the console spies and fake timers are restored so later tests aren't affected. Test in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/docs/codeBlocks.ts` | `REPO_ROOT`, `TYPESCRIPT_DOCS`, `FRAGMENT_MARKER`, `readDoc()`, `extractCodeBlocks()`, `isFragment()` |
| `tests/docs/codeBlocks.test.ts` | Unit tests for extraction, plus a guard that every listed document has TypeScript samples |
| `tests/docs/typeCheck.ts` | `typeCheck(files, declarationFiles)`: in-memory type-check with the repo's compiler options and the package paths mapped to `src/` (reused by phase 2 for scenario code) |
| `tests/docs/typeCheck.test.ts` | Unit tests for `typeCheck` |
| `tests/docs/preludes/readme.d.ts`, `examples.d.ts`, `sse-python.d.ts`, `websocket-server-events.d.ts`, `react.d.ts` | What each document's samples assume without defining |
| `tests/docs/samples.typecheck.test.ts` | Type-checks every sample of every listed document |
| `tests/docs/outputs.ts` | `parseExpectations()`, `findMissingExpectation()`, `toRunnable()`, `runSample()` |
| `tests/docs/outputs.test.ts` | Unit tests for the output helpers |
| `tests/docs/readme.outputs.test.ts` | Runs every README sample that has `// Output:` / `// Logs:` comments and compares |
| `tests/sse/python.test.ts` | + Flask and FastAPI cases (Task 5) |
| `src/websocket/WebSocketHandler.ts` | Count an error on a socket that never opened as a failed attempt (Task 6); no `disconnected → disconnected` event (Task 7) |
| `tests/websocket/websocket-handler.test.ts` | Tests for Tasks 6 and 7, including one with Node.js 22's built-in `WebSocket` |
| `src/eventEmitter.ts`, `tests/memoryLeak.test.ts` | Leak-warning details list the counted subscriptions (Task 8) |
| `CHANGELOG.md` | `### Fixed` entries for Tasks 6–8 |
| `README.md`, `docs/examples.md`, `docs/websocket-adapter.md`, `docs/websocket-server-events.md`, `docs/sse-adapter.md`, `docs/sse-python.md`, `examples/python/*_app.py` | Documentation fixes (Tasks 4, 5, 9–12) |
| `tsconfig.json`, `package.json`, `pnpm-lock.yaml` | Exclude the preludes; `@types/ws` (Task 3) |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | Describe the docs checks; mark phase 1 done (Task 13) |

---

### Task 1: Extract code blocks from Markdown

**Files:**
- Create: `tests/docs/codeBlocks.ts`
- Test: `tests/docs/codeBlocks.test.ts`

**Interfaces:**
- Produces (used by Tasks 3 and 4):
  - `REPO_ROOT: string` (absolute, trailing separator)
  - `TYPESCRIPT_DOCS: readonly ['README.md', 'docs/examples.md', 'docs/websocket-adapter.md', 'docs/websocket-server-events.md', 'docs/sse-adapter.md', 'docs/sse-python.md']`, `type TypeScriptDoc`
  - `TYPESCRIPT_LANGUAGES: readonly ['typescript', 'ts', 'tsx']`
  - `FRAGMENT_MARKER = '// docs-check: fragment'`
  - `interface CodeBlock { file: string; language: string; line: number; code: string }` — `line` is the 1-based document line of the block's first line of code
  - `readDoc(file: string): string`, `extractCodeBlocks(markdown: string, file: string, languages: readonly string[]): CodeBlock[]`, `isFragment(block: CodeBlock): boolean`

- [ ] **Step 1: Write the failing tests**

`tests/docs/codeBlocks.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:nowatch tests/docs/codeBlocks.test.ts`
Expected: FAIL — `Failed to load url ./codeBlocks` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

`tests/docs/codeBlocks.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root, with a trailing separator */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Documents whose TypeScript samples are type-checked, relative to the repository root */
export const TYPESCRIPT_DOCS = [
  'README.md',
  'docs/examples.md',
  'docs/websocket-adapter.md',
  'docs/websocket-server-events.md',
  'docs/sse-adapter.md',
  'docs/sse-python.md'
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:nowatch tests/docs/codeBlocks.test.ts`
Expected: PASS (all tests, including one per document in `TYPESCRIPT_DOCS`).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add tests/docs/codeBlocks.ts tests/docs/codeBlocks.test.ts
git commit -m "Docs checks: extract fenced code blocks from Markdown

The start of tests/docs/, which checks the samples in the README and the
docs against the real library. Blocks in other languages are skipped
whole, CRLF documents work, and an unclosed fence throws with its
location. A guard test fails if a listed document stops having
TypeScript samples, e.g. after a fence language is renamed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Type-check code in memory against the real API

**Files:**
- Create: `tests/docs/typeCheck.ts`
- Test: `tests/docs/typeCheck.test.ts`

**Interfaces:**
- Consumes: `REPO_ROOT` from `tests/docs/codeBlocks.ts` (Task 1).
- Produces (used by Task 3, and by phase 2 for scenario code):
  - `interface VirtualFile { path: string; code: string }` — `path` is relative to the repository root and doesn't exist on disk; its extension (`.ts` / `.tsx`) picks the parser
  - `interface TypeDiagnostic { path: string; line: number; code: number; message: string }` — `line` is 1-based within the virtual file
  - `typeCheck(files: VirtualFile[], declarationFiles?: string[]): TypeDiagnostic[]` — `declarationFiles` are absolute paths of `.d.ts` files added to the program (preludes); their own errors are reported too (with `path` relative to the repository root), so a broken prelude can't hide a sample's errors

Why: the compiler options come from the repo's `tsconfig.json` (strict, `noUncheckedIndexedAccess`, DOM + ES2022 libs, Bundler resolution), so samples are held to the same rules as the library. `paths` maps the published package names to `src/`, so samples import `@jcfigueiredo/evem` exactly as users do. `tsconfig.json` uses `moduleDetection: force`, so every virtual file is its own module and two samples declaring the same name don't clash.

- [ ] **Step 1: Write the failing tests**

`tests/docs/typeCheck.test.ts`:

```typescript
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
      const code = ["import { EvEm } from '@jcfigueiredo/evem';", 'const evem = new EvEm();', 'evem.subscribe(42, () => {});'].join(
        '\n'
      );
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
      expect(typeCheck([{ path: '__check__/component.tsx', code: 'export const element = <div />;' }], [jsx])).toEqual([]);
    },
    TIMEOUT
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:nowatch tests/docs/typeCheck.test.ts`
Expected: FAIL — `Failed to load url ./typeCheck`.

- [ ] **Step 3: Write the implementation**

`tests/docs/typeCheck.ts`:

```typescript
import { join, relative } from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from './codeBlocks';

/** The published entry points, mapped to their sources */
const PACKAGE_PATHS: Record<string, string[]> = {
  '@jcfigueiredo/evem': ['src/index.ts'],
  '@jcfigueiredo/evem/websocket': ['src/websocket/index.ts'],
  '@jcfigueiredo/evem/sse': ['src/sse/index.ts'],
  '@jcfigueiredo/evem/sse/server': ['src/sse/server.ts']
};

export interface VirtualFile {
  /** Path relative to the repository root (it doesn't exist on disk); `.ts` or `.tsx` */
  path: string;
  code: string;
}

export interface TypeDiagnostic {
  /** The virtual file's path, as given */
  path: string;
  /** 1-based line within the virtual file (0 if the diagnostic has no position) */
  line: number;
  /** TypeScript error code, e.g. 2345 */
  code: number;
  message: string;
}

/** The repository's compiler options, with the package names mapped to src/ and JSX kept as is */
function compilerOptions(): ts.CompilerOptions {
  const configPath = join(REPO_ROOT, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, REPO_ROOT);
  return {
    ...options,
    noEmit: true,
    incremental: false,
    jsx: ts.JsxEmit.Preserve,
    paths: { ...options.paths, ...PACKAGE_PATHS }
  };
}

/**
 * Type-check in-memory files against the library's sources, with the repository's compiler options.
 * `declarationFiles` (absolute paths) are added to the program, e.g. preludes that declare globals.
 * Returns the syntactic and semantic diagnostics of the in-memory files and of the declaration files.
 */
export function typeCheck(files: VirtualFile[], declarationFiles: string[] = []): TypeDiagnostic[] {
  const options = compilerOptions();
  const virtual = new Map(files.map(file => [join(REPO_ROOT, file.path), file]));

  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const file = virtual.get(fileName);
    return file
      ? ts.createSourceFile(fileName, file.code, languageVersion, true)
      : getSourceFile.call(host, fileName, languageVersion, ...rest);
  };
  host.fileExists = fileName => virtual.has(fileName) || fileExists.call(host, fileName);
  host.readFile = fileName => virtual.get(fileName)?.code ?? readFile.call(host, fileName);

  const checked = [...virtual.keys(), ...declarationFiles];
  const program = ts.createProgram(checked, options, host);
  return checked.flatMap(fileName => {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
      throw new Error(`${fileName} wasn't added to the program`);
    }
    return [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)].map(
      diagnostic => ({
        path: virtual.get(fileName)?.path ?? relative(REPO_ROOT, fileName),
        line:
          diagnostic.file && diagnostic.start !== undefined
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
            : 0,
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
      })
    );
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:nowatch tests/docs/typeCheck.test.ts`
Expected: PASS (7 tests). If the misuse test reports a different code than 2345, print the diagnostics and fix the test to the code TypeScript actually reports for passing a number where a string is expected; don't loosen it to "any diagnostic".

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add tests/docs/typeCheck.ts tests/docs/typeCheck.test.ts
git commit -m "Docs checks: type-check code in memory against the real API

typeCheck() builds a TypeScript program from in-memory files with the
repository's compiler options, the package names mapped to src/ (so
samples import @jcfigueiredo/evem as users do) and optional declaration
files for globals a sample assumes. Each file is its own module.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 3: Type-check every sample in the docs

**Files:**
- Create: `tests/docs/preludes/readme.d.ts`, `tests/docs/preludes/examples.d.ts`, `tests/docs/preludes/sse-python.d.ts`, `tests/docs/preludes/websocket-server-events.d.ts`, `tests/docs/preludes/react.d.ts`
- Create: `tests/docs/samples.typecheck.test.ts`
- Modify: `tsconfig.json` (exclude the preludes), `package.json` + `pnpm-lock.yaml` (`@types/ws` dev dependency)

**Interfaces:**
- Consumes: `extractCodeBlocks`, `isFragment`, `readDoc`, `TYPESCRIPT_DOCS`, `TYPESCRIPT_LANGUAGES`, `type TypeScriptDoc` (Task 1); `typeCheck`, `type VirtualFile` (Task 2).
- Produces: the preludes (Task 4 doesn't use them; runtime scope is separate).

Why each prelude exists (found by type-checking every block without them: 104 blocks, 45 failing, all from these names):
- README samples use the Quick Start's `evem` and stand-ins for the reader's own code (`updateLayout`, `saveDocument`, …).
- `docs/examples.md` shows `import { EvEm }` and `const evem` once, in "Importing and Initializing EvEm", and "Concurrent Requests" reuses the previous example's `handler`.
- `docs/sse-python.md` calls the reader's `render`.
- `docs/websocket-server-events.md` has a React (`.tsx`) client: a stub of the five hooks it uses and a minimal JSX namespace, instead of depending on `@types/react`.
- Three samples import `ws` (Node.js clients and servers); `@types/ws` gives them the real types (with an `any` stub, the `AuthenticatedSocket` sample can't be checked).
- `tsconfig.json` includes `**/*.ts`, which covers `.d.ts` files: without the exclusion, `pnpm typecheck` would load every prelude at once and report `evem` as declared twice.

- [ ] **Step 1: Write the failing test**

`tests/docs/samples.typecheck.test.ts`:

```typescript
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
  'docs/examples.md': [prelude('examples.d.ts')],
  'docs/websocket-adapter.md': [],
  'docs/websocket-server-events.md': [prelude('websocket-server-events.d.ts'), prelude('react.d.ts')],
  'docs/sse-adapter.md': [],
  'docs/sse-python.md': [prelude('sse-python.d.ts')]
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
        firstLine === undefined ? `${diagnostic.path}:${diagnostic.line}` : `${file}:${firstLine + diagnostic.line - 1}`;
      return `${location}: TS${diagnostic.code} ${diagnostic.message}`;
    });
    expect(problems).toEqual([]);
  }, 60_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:nowatch tests/docs/samples.typecheck.test.ts`
Expected: FAIL. The four documents with preludes (README, `docs/examples.md`, `docs/websocket-server-events.md`, `docs/sse-python.md`) fail with `…/tests/docs/preludes/<name>.d.ts wasn't added to the program`, because the prelude files don't exist yet. `docs/websocket-adapter.md` fails with `TS2307 Cannot find module 'ws'`. `docs/sse-adapter.md` already passes (its samples need nothing from outside).

- [ ] **Step 3: Add `@types/ws` and exclude the preludes from the root type-check**

```bash
pnpm add -D @types/ws@^8.18.0
```

In `tsconfig.json`, change the `exclude` line:

```json
  "exclude": ["node_modules", "dist", "tests/docs/preludes"]
```

- [ ] **Step 4: Write the preludes**

`tests/docs/preludes/readme.d.ts`:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';

// What the README's samples use without defining: the emitter from the Quick Start, and stand-ins for
// the reader's own code, typed loosely so the check is about EvEm's API, not about these
declare global {
  const evem: EvEm;
  const requestData: any;
  const userData: any;
  function autoTagDocument(...args: any[]): any;
  function checkUserPermissions(...args: any[]): any;
  function detectClientInfo(...args: any[]): any;
  function extractMetadata(...args: any[]): any;
  function handleDocUpdate(...args: any[]): any;
  function initializeApp(...args: any[]): any;
  function isAuthenticated(...args: any[]): any;
  function processData(...args: any[]): any;
  function saveDocument(...args: any[]): any;
  function showNotification(...args: any[]): any;
  function showOnboardingTutorial(...args: any[]): any;
  function showWelcomeDialog(...args: any[]): any;
  function suggestCompletions(...args: any[]): any;
  function updateDisplay(...args: any[]): any;
  function updateLayout(...args: any[]): any;
  function updateScrollIndicator(...args: any[]): any;
}

export {};
```

`tests/docs/preludes/examples.d.ts`:

```typescript
import type { EvEm as EvEmClass } from '@jcfigueiredo/evem';
import type { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

declare global {
  // docs/examples.md imports EvEm and creates `evem` once, in "Importing and Initializing EvEm"
  const EvEm: typeof EvEmClass;
  type EvEm = EvEmClass;
  const evem: EvEmClass;
  // "Concurrent Requests" uses the handler from the previous example
  const handler: WebSocketHandler;
}

export {};
```

`tests/docs/preludes/sse-python.d.ts`:

```typescript
declare global {
  // The reader's own UI code
  function render(...args: any[]): any;
}

export {};
```

`tests/docs/preludes/websocket-server-events.d.ts`:

```typescript
// The minimal JSX types the React client sample needs: elements, children passed between tags, and
// typed event handlers on intrinsic elements (so `onChange={event => …}` isn't an implicit any)
declare global {
  namespace JSX {
    interface Element {}
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements {
      [name: string]: {
        [attribute: string]: unknown;
        onChange?: (event: { target: HTMLInputElement }) => void;
        onClick?: (event: MouseEvent) => void;
        onSubmit?: (event: SubmitEvent) => void;
      };
    }
  }
}

export {};
```

`tests/docs/preludes/react.d.ts` (no top-level import or export: it must stay a script, so `declare module` declares the module instead of augmenting one):

```typescript
// The parts of React that the client sample in docs/websocket-server-events.md uses, with React's signatures
declare module 'react' {
  export type ReactNode = JSX.Element | string | number | boolean | null | undefined | readonly ReactNode[];
  export interface Context<T> {
    Provider: (props: { value: T; children?: ReactNode }) => JSX.Element;
  }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  export function useRef<T>(initial: T): { current: T };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:nowatch tests/docs/samples.typecheck.test.ts`
Expected: PASS for all six documents. (Verified while planning: with these preludes and `@types/ws`, every block type-checks. If a document fails, read the reported `file:line` — it's either a name the prelude is missing, which goes in that document's prelude with a comment saying why, or a real error in the sample, which is fixed in the document.)

- [ ] **Step 6: Check that a broken sample is caught**

Temporarily change `evem.subscribe("party.start"` in README.md's Quick Start to `evem.subscribe(42`, run the test, and confirm it fails with `README.md:<line>: TS2345 …` pointing at that line. Then undo the change (`git checkout README.md`).

- [ ] **Step 7: Run everything, format and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch tests/docs
git add tests/docs/preludes tests/docs/samples.typecheck.test.ts tsconfig.json package.json pnpm-lock.yaml
git commit -m "Docs checks: type-check every TypeScript sample in the docs

Every typescript/ts/tsx block in the README, docs/examples.md, the
WebSocket and SSE adapter docs and docs/sse-python.md is now
type-checked against src/ with the repository's compiler options. Each
document has a prelude for what its samples use without defining (the
Quick Start's evem, stand-ins for the reader's code, React's hooks for
the .tsx client), and @types/ws (types only) checks the Node.js samples
that import ws. A block can opt out with // docs-check: fragment.

tsconfig.json excludes the preludes: they declare the same globals per
document and are only loaded by these tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Check the README's `// Output:` comments against real runs

**Files:**
- Create: `tests/docs/outputs.ts`, `tests/docs/outputs.test.ts`, `tests/docs/readme.outputs.test.ts`
- Modify: `README.md` (one comment, so its note uses the `<-` convention)

**Interfaces:**
- Consumes: `extractCodeBlocks`, `readDoc`, `TYPESCRIPT_LANGUAGES` (Task 1).
- Produces:
  - `interface Expectations { output: string[]; logs: string[] }`, `interface SampleRun { output: string[]; logs: string[] }`
  - `parseExpectations(code: string, location: string): Expectations`
  - `findMissingExpectation(actual: string[], expected: string[]): string | undefined`
  - `toRunnable(code: string, location: string): string`
  - `runSample(code: string, location: string, modules: Record<string, unknown>, scope?: Record<string, unknown>): Promise<SampleRun>`

The comment conventions, as the README uses them (checked while planning: the README's 15 such samples all print what they say once these rules are applied):
- `// Output: text` or `// Output:` followed by `// line` comment lines → `console.log`. `// Logs:` → `console.error` / `console.warn`. A label may carry a note in parentheses: `// Output (with the current time):`.
- Expected lines must appear **in order**; other output may come between them (e.g. a `console.log` the sample doesn't annotate).
- Whitespace is compared loosely (Node prints long objects over several lines; the README writes them on one), `'…'` stands for any quoted string (ids), a trailing `...` for the rest of the line (stack traces), an ISO timestamp for any timestamp.
- A note after `<-` is not part of the expected text: `// Report finished   <- 1.5 seconds later: …`.

- [ ] **Step 1: Write the failing unit tests**

`tests/docs/outputs.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../src/index';
import { findMissingExpectation, parseExpectations, runSample, toRunnable } from './outputs';

const MODULES = { '@jcfigueiredo/evem': core };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('parseExpectations', () => {
  it('reads labels with the text on the same line', () => {
    const code = ["console.log('a');", '// Output: a', "console.error('b');", '// Logs: b ...'].join('\n');
    expect(parseExpectations(code, 'doc.md:1')).toEqual({ output: ['a'], logs: ['b ...'] });
  });

  it('reads the comment lines below a label, up to a line that is not a comment or is another label', () => {
    const code = [
      '// Output (with the current time):',
      '// first',
      '//   second, indented',
      '// Logs: an error',
      '',
      '// a regular comment after a blank line'
    ].join('\n');
    expect(parseExpectations(code, 'doc.md:1')).toEqual({ output: ['first', 'second, indented'], logs: ['an error'] });
  });

  it('drops notes after <-', () => {
    expect(parseExpectations('// Output:\n// done   <- 1.5 seconds later', 'doc.md:1').output).toEqual(['done']);
  });

  it('throws for a label with nothing after it, with the location', () => {
    expect(() => parseExpectations('// Output:\nconsole.log(1);', 'README.md:12')).toThrow(
      'README.md:12: "// Output:" has nothing after it'
    );
  });
});

describe('findMissingExpectation', () => {
  it('accepts expected lines that appear in order, with other output between them', () => {
    expect(findMissingExpectation(['a', 'noise', 'b'], ['a', 'b'])).toBeUndefined();
  });

  it('returns the first expected line that is missing or out of order', () => {
    expect(findMissingExpectation(['b', 'a'], ['a', 'b'])).toBe('b');
    expect(findMissingExpectation(['a'], ['a', 'c'])).toBe('c');
  });

  it("compares whitespace loosely and reads '…', a trailing ... and ISO timestamps as wildcards", () => {
    const actual = [
      "{\n  event: 'user.login',\n  id: '98bac2d2-a42c-4ab9-89b8-5bcd3f1a1441'\n}",
      'Error: boom\n    at file.js:1:1',
      'at 2026-10-02T20:35:04.100Z'
    ];
    const expected = ["{ event: 'user.login', id: '…' }", 'Error: boom ...', 'at 2026-10-02T15:30:45.123Z'];
    expect(findMissingExpectation(actual, expected)).toBeUndefined();
  });
});

describe('toRunnable', () => {
  it('replaces imports from the package with lookups in __modules', () => {
    const code = "import { EvEm as Emitter, type CancelableEvent } from '@jcfigueiredo/evem';\nconst e = new Emitter();";
    expect(toRunnable(code, 'doc.md:1')).toContain('const { EvEm: Emitter } = __modules["@jcfigueiredo/evem"];');
  });

  it('throws for other imports, with the location', () => {
    expect(() => toRunnable("import WebSocket from 'ws';\nnew WebSocket('x');", 'doc.md:3')).toThrow(
      'doc.md:3: samples that are run can only import from @jcfigueiredo/evem'
    );
  });
});

describe('runSample', () => {
  it('captures console.log as output and console.error / console.warn as logs', async () => {
    const run = await runSample("console.log('a', { b: 1 }); console.error('c'); console.warn('d');", 'doc.md:1', MODULES);
    expect(run).toEqual({ output: ['a { b: 1 }'], logs: ['c', 'd'] });
  });

  it('runs the package imports, the scope and the timers without waiting for real time', async () => {
    const code = [
      "import { EvEm } from '@jcfigueiredo/evem';",
      'const start = Date.now();',
      'const emitter = new EvEm();',
      "emitter.subscribe('tick', async () => { await new Promise(resolve => setTimeout(resolve, 1000)); console.log('handled'); });",
      "await emitter.publish('tick');",
      'console.log(Date.now() - start, greeting);',
      "setTimeout(() => console.log('later'), 500);"
    ].join('\n');
    const started = performance.now();
    const run = await runSample(code, 'doc.md:1', MODULES, { greeting: 'hi' });
    expect(run.output).toEqual(['handled', '1000 hi', 'later']);
    expect(performance.now() - started).toBeLessThan(900);
  });

  it('fails with the location when the sample throws, and restores the console and timers', async () => {
    await expect(runSample("throw new Error('boom');", 'README.md:5', MODULES)).rejects.toThrow('README.md:5: boom');
    expect(vi.isFakeTimers()).toBe(false);
    expect(vi.isMockFunction(console.log)).toBe(false);
  });

  it('fails with the location when the sample never finishes', async () => {
    await expect(runSample('await new Promise(() => {});', 'README.md:7', MODULES)).rejects.toThrow(
      'README.md:7: the sample never finished'
    );
  });

  it('fails with the location when the sample keeps scheduling timers', async () => {
    await expect(runSample("setInterval(() => console.log('tick'), 1000);", 'README.md:9', MODULES)).rejects.toThrow(
      'README.md:9: Aborting after running'
    );
  }, 30_000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:nowatch tests/docs/outputs.test.ts`
Expected: FAIL — `Failed to load url ./outputs`.

- [ ] **Step 3: Write the implementation**

`tests/docs/outputs.ts`:

```typescript
import { format } from 'node:util';
import ts from 'typescript';
import { vi } from 'vitest';

/** What a sample's comments say it prints: `// Output:` → console.log, `// Logs:` → console.error / console.warn */
export interface Expectations {
  output: string[];
  logs: string[];
}

/** What a sample printed, split the same way */
export interface SampleRun {
  output: string[];
  logs: string[];
}

const LABEL = /^\s*\/\/ (Output|Logs)(?: \([^)]*\))?:[ \t]?(.*)$/;
const COMMENT = /^\s*\/\/ ?(.*)$/;
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

/**
 * The output a sample's comments describe. A label has its text on the same line (`// Output: done`) or on the
 * comment lines right below it (`// Output:`, then `// line 1`, `// line 2`), up to the first line that isn't a
 * comment or is another label. A note after `<-` is dropped. Throws for a label with nothing to check.
 */
export function parseExpectations(code: string, location: string): Expectations {
  const expectations: Expectations = { output: [], logs: [] };
  const lines = code.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const label = LABEL.exec(lines[index]!);
    if (!label) continue;
    const kind = label[1]!;
    const sameLine = label[2]!;
    const texts = sameLine.trim() ? [sameLine] : [];
    if (texts.length === 0) {
      while (index + 1 < lines.length && !LABEL.test(lines[index + 1]!) && COMMENT.test(lines[index + 1]!)) {
        texts.push(COMMENT.exec(lines[++index]!)![1]!);
      }
    }
    const expected = texts.map(text => text.replace(/\s+<-.*$/, '').trim()).filter(text => text !== '');
    if (expected.length === 0) {
      throw new Error(`${location}: "// ${kind}:" has nothing after it`);
    }
    (kind === 'Logs' ? expectations.logs : expectations.output).push(...expected);
  }
  return expectations;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A pattern for one expected line: whitespace already normalized, `'…'` for any quoted string, a trailing `...`
 * for the rest of the line, an ISO timestamp for any timestamp
 */
function expectationPattern(expected: string): RegExp {
  const text = normalizeWhitespace(expected).replace(/\s*\.\.\.$/, '');
  const whole = new RegExp(`^${ISO_TIMESTAMP.source}$`);
  const source = text
    .split(new RegExp(`('…'|${ISO_TIMESTAMP.source})`))
    .map(part => (part === "'…'" ? "'[^']*'" : whole.test(part) ? ISO_TIMESTAMP.source : escapeRegExp(part)))
    .join('');
  return new RegExp(source, 'g');
}

/**
 * The first expected line that doesn't appear in the actual output in order, or undefined when they all do.
 * Other output may come between the expected lines.
 */
export function findMissingExpectation(actual: string[], expected: string[]): string | undefined {
  const text = normalizeWhitespace(actual.join('\n'));
  let position = 0;
  for (const line of expected) {
    const pattern = expectationPattern(line);
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (!match) {
      return line;
    }
    position = match.index + match[0].length;
  }
  return undefined;
}

const PACKAGE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"](@jcfigueiredo\/evem(?:\/[\w/]+)?)['"];?[ \t]*$/gm;

/**
 * A sample as the body of an async function: transpiled to JavaScript, with its imports from the package
 * replaced by lookups in `__modules` (keyed by entry point). Other imports aren't supported.
 */
export function toRunnable(code: string, location: string): string {
  const javascript = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const runnable = javascript
    .replace(PACKAGE_IMPORT, (_, names: string, entryPoint: string) => {
      const bindings = names
        .split(',')
        .map(name => name.trim())
        .filter(Boolean)
        .map(name => name.replace(/\s+as\s+/, ': '));
      return `const { ${bindings.join(', ')} } = __modules[${JSON.stringify(entryPoint)}];`;
    })
    .replace(/^export \{\};?[ \t]*$/m, '');
  const unsupported = /^\s*(?:import|export)\b.*$/m.exec(runnable);
  if (unsupported) {
    throw new Error(
      `${location}: samples that are run can only import from @jcfigueiredo/evem (found: ${unsupported[0].trim()})`
    );
  }
  return runnable;
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...parameters: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** The real setImmediate, kept before any test fakes timers: an idle turn has to really yield to the event loop */
const realSetImmediate = setImmediate;

/** Idle turns (no timer pending, the sample not finished) before a sample counts as stuck */
const MAX_IDLE_TURNS = 20;

/**
 * Run a sample with `__modules` and `scope` in scope and capture what it prints. Timers are faked, so delays
 * take no real time, and timers still pending when it finishes (debounced calls) run too. Throws, prefixed with
 * `location`, when the sample throws, never finishes, or keeps scheduling timers. Restores the console and the
 * real timers either way.
 */
export async function runSample(
  code: string,
  location: string,
  modules: Record<string, unknown>,
  scope: Record<string, unknown> = {}
): Promise<SampleRun> {
  const run: SampleRun = { output: [], logs: [] };
  const capture =
    (lines: string[]) =>
    (...args: unknown[]) => {
      lines.push(format(...args));
    };
  vi.spyOn(console, 'log').mockImplementation(capture(run.output));
  vi.spyOn(console, 'error').mockImplementation(capture(run.logs));
  vi.spyOn(console, 'warn').mockImplementation(capture(run.logs));
  vi.useFakeTimers();
  try {
    const names = Object.keys(scope);
    const sample = new AsyncFunction('__modules', ...names, toRunnable(code, location));
    let settled = false;
    const done = sample(modules, ...names.map(name => scope[name])).finally(() => {
      settled = true;
    });
    // Handled here so a rejection isn't reported as unhandled while the loop below runs the timers
    done.catch(() => undefined);

    let idleTurns = 0;
    while (!settled) {
      if (vi.getTimerCount() > 0) {
        idleTurns = 0;
        await vi.advanceTimersToNextTimerAsync();
      } else if (++idleTurns > MAX_IDLE_TURNS) {
        throw new Error("the sample never finished: it's waiting for something other than a timer");
      } else {
        await new Promise(resolve => realSetImmediate(resolve));
      }
    }
    await done;
    await vi.runAllTimersAsync();
    return run;
  } catch (error) {
    throw new Error(`${location}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm test:nowatch tests/docs/outputs.test.ts`
Expected: PASS. If the "keeps scheduling timers" test fails because Vitest's message differs, print the error and use the message Vitest 1.0.4 actually throws (it comes from `@sinonjs/fake-timers`' loop limit); keep the `README.md:9:` prefix in the assertion.

- [ ] **Step 5: Write the README test**

`tests/docs/readme.outputs.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index';
import * as sse from '../../src/sse/index';
import * as sseServer from '../../src/sse/server';
import * as websocket from '../../src/websocket/index';
import { extractCodeBlocks, readDoc, TYPESCRIPT_LANGUAGES } from './codeBlocks';
import { findMissingExpectation, parseExpectations, runSample } from './outputs';

const MODULES = {
  '@jcfigueiredo/evem': core,
  '@jcfigueiredo/evem/websocket': websocket,
  '@jcfigueiredo/evem/sse': sse,
  '@jcfigueiredo/evem/sse/server': sseServer
};

const samples = extractCodeBlocks(readDoc('README.md'), 'README.md', TYPESCRIPT_LANGUAGES).filter(block =>
  /\/\/ (Output|Logs)\b/.test(block.code)
);

describe('README samples with // Output: or // Logs: comments', () => {
  it('exist', () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples.map(block => [`README.md:${block.line}`, block] as const))(
    '%s prints what its comments say',
    async (location, block) => {
      const expected = parseExpectations(block.code, location);
      // Samples that continue an earlier one use the Quick Start's emitter
      const scope = /\b(?:const|let|var)\s+evem\b/.test(block.code) ? {} : { evem: new core.EvEm() };
      const run = await runSample(block.code, location, MODULES, scope);

      const problems = [
        ['console.log', findMissingExpectation(run.output, expected.output)],
        ['console.error / console.warn', findMissingExpectation(run.logs, expected.logs)]
      ]
        .filter(([, missing]) => missing !== undefined)
        .map(([stream, missing]) => `missing from ${stream}: ${missing}`);
      const report = problems.length
        ? [`${location}`, ...problems, '--- console.log:', ...run.output, '--- console.error / console.warn:', ...run.logs].join('\n')
        : '';
      expect(report).toBe('');
    }
  );
});
```

- [ ] **Step 6: Run it to see the one comment that doesn't follow the conventions**

Run: `pnpm test:nowatch tests/docs/readme.outputs.test.ts`
Expected: FAIL for the Schema Validation sample only, with `missing from console.error / console.warn: Schema validation failed for event 'user.register' (from the first subscriber)`: the parenthesized note isn't part of the log.

- [ ] **Step 7: Use the `<-` convention for that note**

In `README.md`, in the Schema Validation sample, change:

```typescript
// Logs: Schema validation failed for event 'user.register' (from the first subscriber)
```

to:

```typescript
// Logs: Schema validation failed for event 'user.register'  <- from the first subscriber
```

- [ ] **Step 8: Run the docs tests to verify they pass**

Run: `pnpm test:nowatch tests/docs`
Expected: PASS, every README sample with an `// Output:` or `// Logs:` comment included.

- [ ] **Step 9: Check that a wrong comment is caught**

Temporarily change `// Output: Welcome, Alice!` in the Quick Start to `// Output: Welcome, Alicia!`, run `pnpm test:nowatch tests/docs/readme.outputs.test.ts`, and confirm it fails with `missing from console.log: Welcome, Alicia!` and prints the actual output. Undo the change.

- [ ] **Step 10: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch tests/docs
git add tests/docs/outputs.ts tests/docs/outputs.test.ts tests/docs/readme.outputs.test.ts README.md
git commit -m "Docs checks: run the README samples that show their output

Every README sample with // Output: or // Logs: comments now runs in
Node against src/, with fake timers so its delays take no time, and
what it prints must match its comments, in order. Long objects may wrap
differently, '…' stands for an id, a trailing ... for a stack trace,
and notes go after <- (one README comment now does). A sample that
throws, never finishes or keeps scheduling timers fails with its line.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Test the Flask and FastAPI examples, and fix their docs

The audit ran both apps (Flask 3.1.3, FastAPI 0.142.2 + uvicorn 0.54.0, Python 3.11) with a real `SseHandler`: they stream, resume and send heartbeats as documented, but:
- their run commands only work from inside `examples/python` (from the repository root, where the guide's previous command runs, both fail to import the app); the repo-root forms `uvicorn fastapi_app:app --app-dir examples/python` and `flask --app examples/python/flask_app.py run` work (verified while planning);
- "the same code works with plain Starlette" isn't true: the file imports `fastapi` and uses `@app.get`, which a Starlette app doesn't have;
- the examples send named `tick` events, which an EventSource-transport client only receives with `eventTypes: ['tick']`;
- WSGI and `http.server` notice a client that left on a failed write, but the first write after it leaves can still succeed (TCP), so it may be the second.

The tests run where the frameworks are importable and are skipped otherwise, like the existing Python tests are without `python3`. To run them locally, put a virtualenv first on `PATH`:

```bash
python3 -m venv /tmp/evem-py && /tmp/evem-py/bin/pip install flask fastapi uvicorn
PATH=/tmp/evem-py/bin:$PATH pnpm test:nowatch tests/sse/python.test.ts
```

**Files:**
- Modify: `tests/sse/python.test.ts`
- Modify: `docs/sse-python.md`, `examples/python/fastapi_app.py`, `examples/python/flask_app.py`

**Interfaces:**
- Consumes (already in `tests/sse/python.test.ts`): `PYTHON`, `hasPython`, `interface PythonServer { child; url; log }`, `EvEm`, `SseHandler`, `type SseHandlerOptions`.

- [ ] **Step 1: Write the tests**

In `tests/sse/python.test.ts`, add to the imports:

```typescript
import { connect, createServer, type AddressInfo } from 'node:net';
```

and at the end of the file:

```typescript
/** Whether python3 can import all of these modules */
function canImport(...modules: string[]): boolean {
  return hasPython && spawnSync(PYTHON, ['-c', modules.map(name => `import ${name}`).join('; ')]).status === 0;
}

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** A port nothing listens on right now */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

/** Start a framework example with the command docs/sse-python.md gives, from the repository root */
async function startFrameworkApp(command: string[]): Promise<PythonServer> {
  const port = await freePort();
  // -B: don't leave __pycache__ in examples/python
  const child = spawn(PYTHON, ['-B', '-m', ...command, '--port', String(port)], { cwd: repositoryRoot });
  const log: string[] = [];
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => log.push(chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => log.push(chunk));

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`${command.join(' ')} exited with ${child.exitCode}:\n${log.join('')}`);
    }
    const listening = await new Promise<boolean>(resolve => {
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (listening) {
      return { child, url: `http://127.0.0.1:${port}/events`, log };
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`${command.join(' ')} wasn't listening after 15 s:\n${log.join('')}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

const FRAMEWORK_APPS = [
  {
    name: 'FastAPI',
    file: 'fastapi_app.py',
    modules: ['fastapi', 'uvicorn'],
    command: ['uvicorn', 'fastapi_app:app', '--app-dir', 'examples/python']
  },
  {
    name: 'Flask',
    file: 'flask_app.py',
    modules: ['flask'],
    command: ['flask', '--app', 'examples/python/flask_app.py', 'run']
  }
];

for (const app of FRAMEWORK_APPS) {
  describe.skipIf(!canImport(...app.modules))(`SseHandler against the ${app.name} example (examples/python/${app.file})`, () => {
    let server: PythonServer | undefined;
    let handler: SseHandler | undefined;

    afterEach(async () => {
      await handler?.disconnect();
      handler = undefined;
      const child = server?.child;
      server = undefined;
      if (child && child.exitCode === null && child.signalCode === null) {
        await new Promise(resolve => {
          child.once('exit', resolve);
          child.kill('SIGKILL');
        });
      }
    });

    /** The numbers of the first `count` ticks a new handler publishes as server.tick */
    function receiveTicks(count: number, options: SseHandlerOptions = {}): Promise<number[]> {
      const evem = new EvEm();
      const received: number[] = [];
      return new Promise(resolve => {
        evem.subscribe<{ n: number }>('server.tick', tick => {
          received.push(tick.n);
          if (received.length === count) resolve(received);
        });
        handler = new SseHandler(server!.url, evem, options);
      });
    }

    it('streams numbered ticks that the handler publishes as server.tick', async () => {
      server = await startFrameworkApp(app.command);
      expect(await receiveTicks(2)).toEqual([1, 2]);
    }, 20_000);

    it('resumes after the id in the lastEventId option (sent as Last-Event-ID)', async () => {
      server = await startFrameworkApp(app.command);
      expect(await receiveTicks(1, { lastEventId: '41' })).toEqual([42]);
    }, 20_000);
  });
}
```

- [ ] **Step 2: Run the tests with and without the frameworks**

Run: `pnpm test:nowatch tests/sse/python.test.ts`
Expected without Flask / FastAPI installed: the new blocks are reported as skipped, the existing ones still pass (or are skipped without `python3`).

Run (with the virtualenv from above): `PATH=/tmp/evem-py/bin:$PATH pnpm test:nowatch tests/sse/python.test.ts`
Expected: PASS, 4 new tests (each takes a second or two: the apps tick once a second).

- [ ] **Step 3: Check that a broken app is caught**

Temporarily change `@app.get("/events")` to `@app.get("/stream")` in `examples/python/flask_app.py`, rerun with the virtualenv and confirm both Flask tests fail (the handler gets a 404 and never publishes `server.tick`, so they time out). Undo the change.

- [ ] **Step 4: Fix the run commands in the guide**

In `docs/sse-python.md`, under "FastAPI / Starlette", replace:

```bash
uvicorn fastapi_app:app --port 8000
```

with:

```bash
uvicorn fastapi_app:app --app-dir examples/python --port 8000   # from the repository root
```

and under "Flask", replace:

```bash
flask --app flask_app run --port 8000
```

with:

```bash
flask --app examples/python/flask_app.py run --port 8000   # from the repository root
```

In the docstring of `examples/python/fastapi_app.py`, replace:

```
    uvicorn fastapi_app:app --port 8000      # evem_sse.py next to this file
```

with:

```
    uvicorn fastapi_app:app --port 8000                            # here, with evem_sse.py next to this file
    uvicorn fastapi_app:app --app-dir examples/python --port 8000   # from the repository root
```

and in `examples/python/flask_app.py`, replace:

```
    flask --app flask_app run --port 8000    # evem_sse.py next to this file
```

with:

```
    flask --app flask_app run --port 8000                      # here, with evem_sse.py next to this file
    flask --app examples/python/flask_app.py run --port 8000   # from the repository root
```

- [ ] **Step 5: Say what plain Starlette needs**

In `examples/python/fastapi_app.py`, replace the first docstring line:

```
"""SSE endpoint for evem clients with FastAPI (the same code works with plain Starlette).
```

with:

```
"""SSE endpoint for evem clients with FastAPI (with plain Starlette, only the imports and the route change).
```

In `docs/sse-python.md`, in the notes under the FastAPI code, after the "**Disconnects:**" bullet, add:

```markdown
- **Plain Starlette:** `ticks()`, `resume_after()` and `StreamingResponse` work unchanged. Import `Request` from `starlette.requests` and `StreamingResponse` from `starlette.responses`, drop the `@app.get` decorator, and register the endpoint with `app = Starlette(routes=[Route("/events", events)])` (`from starlette.applications import Starlette`, `from starlette.routing import Route`).
```

- [ ] **Step 6: Mention `eventTypes` for EventSource-transport clients (Examples)**

Replace:

```markdown
All three examples stream numbered `tick` events (`{"n": 1}`, `{"n": 2}`, …) on `/events`. The client receives them as `server.tick`.
```

with:

```markdown
All three examples stream numbered `tick` events (`{"n": 1}`, `{"n": 2}`, …) on `/events`. The client receives them as `server.tick`; with the EventSource transport, it needs `eventTypes: ['tick']` (see [Native EventSource clients](#native-eventsource-clients)).
```

- [ ] **Step 7: Say when a write notices a client that left**

Replace (standard-library example):

```markdown
(`BrokenPipeError` / `ConnectionResetError` on the next write).
```

with:

```markdown
(`BrokenPipeError` / `ConnectionResetError` on a later write; the first write after the client leaves can still succeed).
```

and (Flask notes):

```markdown
The server finds out when the next write fails, closes the generator, and `finally` runs.
```

with:

```markdown
The server finds out when a write fails (the first one after the client leaves can still succeed, so it may be the second), closes the generator, and `finally` runs.
```

- [ ] **Step 8: Run the Python and docs tests, format and commit**

```bash
pnpm format && pnpm typecheck
PATH=/tmp/evem-py/bin:$PATH pnpm test:nowatch tests/sse/python.test.ts tests/docs
git status --short examples/python   # must show only the two edited files: no __pycache__
git add tests/sse/python.test.ts docs/sse-python.md examples/python/fastapi_app.py examples/python/flask_app.py
git commit -m "Test the Flask and FastAPI SSE examples; fix their docs

tests/sse/python.test.ts now starts fastapi_app.py and flask_app.py
with the commands the guide gives and connects a real SseHandler:
ticks arrive as server.tick, and the lastEventId option resumes after
it. The tests are skipped where the frameworks aren't importable (put a
virtualenv with flask, fastapi and uvicorn first on PATH to run them).

The guide's run commands only worked from inside examples/python; they
now work from the repository root. Plain Starlette needs other imports
and a Route, an EventSource-transport client needs eventTypes: ['tick'],
and a client that left may only be noticed on the second write.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Library fixes found by the audit

Three places where the code doesn't do what the docs say (verified while planning; each one gets a failing test first, its own commit and a CHANGELOG entry under `### Fixed` in the `## 0.3.0 (unreleased)` section). A fourth candidate, `ws.send.*` names that merely contain `queued` being skipped, is documented behavior (`docs/websocket-adapter.md`: "Names containing `queued` are reserved for the queue"), so it's handled as a doc fix in Task 11 instead.

### Task 6: WebSocketHandler — a failed connection attempt that only reports an error still counts

Node.js 22's built-in `WebSocket` (undici) fires `error` but never `close` when a connection attempt fails (refused, or a non-101 response); `readyState` stays `0`. Reproduced while planning on Node 22.22.0. The handler only treats `close` as a failed attempt, so with `reconnect: true` a refused first connection never moves to `reconnecting`, and a refused reconnection attempt leaves it in `reconnecting` forever, never publishing `ws.reconnect.failed`. The docs promise both (`docs/websocket-adapter.md`: "Node.js 22 and later have a global `WebSocket`, so a URL works as-is"; "an initial connection that fails also moves to `reconnecting`").

The fix: an `error` on a socket that never opened counts as the failed attempt, once. That socket's handlers are detached, so the `close` that browsers and `ws` send afterwards is ignored, and its later errors are swallowed (a `ws` socket with no `error` listener would throw). An error on an open socket still waits for its `close`, as before.

**Files:**
- Modify: `src/websocket/WebSocketHandler.ts` (`autoWireWebSocketEvents`)
- Test: `tests/websocket/websocket-handler.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests**

In `tests/websocket/websocket-handler.test.ts`, add `import { createServer, type AddressInfo } from 'node:net';` to the imports, then add these tests at the end of the `describe('WebSocketHandler - reconnect', …)` block (it provides `url`, `createHandler`, `socket(index)`, `instances`, `advance(ms)`, `states` and `reconnectFailedHandler`; sockets only open or fail when the test says so):

```typescript
  it("should count an error on a socket that never opened as a failed attempt, even without a close (Node.js 22's WebSocket)", async () => {
    handler = createHandler(url, { maxReconnectAttempts: 2 });

    socket(0).simulateError(new Error('connect ECONNREFUSED'));
    await advance(0);
    expect(handler.getConnectionState()).toBe('reconnecting');

    await advance(100);
    expect(instances).toHaveLength(2);
    socket(1).simulateError();
    await advance(100);
    expect(instances).toHaveLength(3);
    socket(2).simulateError();
    await advance(1000);

    expect(instances).toHaveLength(3);
    expect(states).toEqual(['reconnecting', 'disconnected']);
    expect(reconnectFailedHandler).toHaveBeenCalledWith({ attempts: 2 });
  });

  it('should count an error followed by a close (browsers, ws) as one failed attempt', async () => {
    handler = createHandler(url, { maxReconnectAttempts: 1 });

    socket(0).simulateError();
    socket(0).simulateClose(1006);
    await advance(100);
    expect(instances).toHaveLength(2);

    socket(1).simulateError();
    socket(1).simulateClose(1006);
    await advance(1000);

    expect(instances).toHaveLength(2);
    expect(states).toEqual(['reconnecting', 'disconnected']);
    expect(reconnectFailedHandler).toHaveBeenCalledTimes(1);
  });

  it('should leave an error on an open socket to the close that follows it', async () => {
    handler = createHandler(url);
    socket(0).simulateOpen();
    await advance(0);

    socket(0).simulateError();
    await advance(1000);

    expect(handler.getConnectionState()).toBe('connected');
    expect(instances).toHaveLength(1);
  });
```

And a new block at the end of the file, which runs where Node.js has a global `WebSocket` (22+; CI runs Node 20 and 22, so it runs on 22):

```typescript
describe.skipIf(typeof WebSocket === 'undefined')("WebSocketHandler with Node.js's built-in WebSocket", () => {
  it('should retry and give up when nothing listens on the port', async () => {
    // A port nothing listens on: open one, note it, close it
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise(resolve => probe.close(resolve));

    const evem = new EvEm();
    const states: string[] = [];
    evem.subscribe('ws.connection.state', (change: any) => {
      states.push(change.to);
    });
    const failed = new Promise(resolve => evem.subscribe('ws.reconnect.failed', resolve));
    const handler = new WebSocketHandler(`ws://127.0.0.1:${port}`, evem, {
      reconnect: true,
      reconnectDelay: 10,
      maxReconnectAttempts: 2,
      onError: () => {}
    });

    await expect(failed).resolves.toEqual({ attempts: 2 });
    expect(states).toEqual(['reconnecting', 'disconnected']);
    await handler.disconnect();
  }, 10_000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:nowatch tests/websocket/websocket-handler.test.ts`
Expected:
- "should count an error on a socket that never opened…" FAILS: `expected 'disconnected' to be 'reconnecting'`.
- "should count an error followed by a close…" and "should leave an error on an open socket…" PASS already (they guard the fix against counting twice or treating errors on open sockets as failures).
- "should retry and give up when nothing listens on the port" FAILS on Node 22 with a 10 s timeout (skipped on Node 20).

- [ ] **Step 3: Write the fix**

In `src/websocket/WebSocketHandler.ts`, `autoWireWebSocketEvents()` becomes:

```typescript
  /**
   * Auto-wire WebSocket lifecycle events to EvEm and ConnectionManager
   */
  private autoWireWebSocketEvents(): void {
    const socket = this.ws;
    // A connection attempt that fails may report only an error (see onerror)
    let opened = socket.readyState === socket.OPEN;

    // Wire onopen
    this.ws.onopen = async event => {
      opened = true;
      this.reconnectAttempts = 0;
      await this.connectionManager.transitionTo('connected');
    };

    // Wire onclose
    this.ws.onclose = async event => {
      if (!this.isDisconnecting) {
        await this.handleUnexpectedClose();
      }
    };

    // Wire onerror
    this.ws.onerror = (event: any) => {
      // Extract error from event object (MockWebSocket format) or create generic error
      const error = event.error || (event instanceof Error ? event : new Error('WebSocket error'));

      // Emit error event
      this.evem.publish('ws.error', { error, event });

      // Call custom error handler if provided
      if (this.options.onError) {
        this.options.onError(error);
      }

      // A failed connection attempt gets an error and then, per the WebSocket standard, a close. Node.js 22's
      // built-in WebSocket never sends that close, so the attempt counts as failed here, once: this socket's
      // handlers come off (a close that does follow is ignored) and its further errors are swallowed, since a
      // `ws` socket without an error listener throws
      if (!opened && !this.isDisconnecting) {
        this.detachWebSocketEvents();
        socket.onerror = () => undefined;
        void this.handleUnexpectedClose();
      }
    };

    // Wire onmessage
    this.ws.onmessage = event => {
      this.handleIncomingMessage(event.data);
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:nowatch tests/websocket`
Expected: PASS, including the existing reconnect and disconnect tests.

- [ ] **Step 5: Add the CHANGELOG entry**

In `CHANGELOG.md`, under `## 0.3.0 (unreleased)` → `### Fixed`, add as the first item:

```markdown
- **`WebSocketHandler` with Node.js 22's built-in `WebSocket`**: a refused connection attempt fires only `error` there, never `close`, so with `reconnect: true` the handler didn't retry, stayed in `reconnecting` and never published `ws.reconnect.failed`. An error on a socket that never opened now counts as the failed attempt (once: a `close` that follows it, as in browsers and with `ws`, is ignored).
```

- [ ] **Step 6: Format, check and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch
git add src/websocket/WebSocketHandler.ts tests/websocket/websocket-handler.test.ts CHANGELOG.md
git commit -m "WebSocketHandler: count a failed attempt that only reports an error

Node.js 22's built-in WebSocket fires error but never close when a
connection attempt fails, and its readyState stays CONNECTING. The
handler only counted closes as failed attempts, so with reconnect: true
a refused connection was never retried, the state stayed reconnecting
and ws.reconnect.failed was never published.

An error on a socket that never opened now counts as the failed attempt.
Its handlers come off, so the close that browsers and ws send after the
error doesn't count it twice, and later errors from it are swallowed
(a ws socket without an error listener throws). Errors on an open socket
still wait for their close. The new test with the real built-in
WebSocket runs on Node.js 22 and is skipped on 20.

Found by the docs audit (docs/demo-revamp-design.md, phase 1).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: WebSocketHandler — no `disconnected → disconnected` state event

A socket that closes (or, after Task 6, fails) before ever opening, without `reconnect`, makes the handler call `transitionTo('disconnected')` while the state is already `disconnected`. `ConnectionManager` publishes every transition it's asked for (deliberately; `tests/websocket/connection-manager.test.ts` "should handle transition to same state"), so subscribers get `{ from: 'disconnected', to: 'disconnected' }`, although the README and `docs/websocket-adapter.md` say `ws.connection.state` is published "when the state changes" / "on every state change". `disconnect()` already skips the transition when the state is `disconnected`; `handleUnexpectedClose()` should too.

**Files:**
- Modify: `src/websocket/WebSocketHandler.ts` (`handleUnexpectedClose`)
- Test: `tests/websocket/websocket-handler.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the failing test**

In `tests/websocket/websocket-handler.test.ts`, inside `describe('WebSocketHandler - regressions', …)` → `describe('disconnect()', …)`, next to "should not emit state changes when already disconnected", add:

```typescript
    it('should not publish a state change when a socket that never opened closes', async () => {
      const stateHandler = vi.fn();
      evem.subscribe('ws.connection.state', stateHandler);
      handler = new WebSocketHandler(mockWs, evem);

      mockWs.simulateClose(1006);
      await tick();

      expect(stateHandler).not.toHaveBeenCalled();
      expect(handler.getConnectionState()).toBe('disconnected');
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:nowatch tests/websocket/websocket-handler.test.ts -t "never opened closes"`
Expected: FAIL — `stateHandler` was called with `{ from: 'disconnected', to: 'disconnected', timestamp: … }`.

- [ ] **Step 3: Write the fix**

In `handleUnexpectedClose()`, replace:

```typescript
    if (!this.options.reconnect || !this.url) {
      await this.connectionManager.transitionTo('disconnected');
      return;
    }
```

with:

```typescript
    if (!this.options.reconnect || !this.url) {
      // A socket that never opened leaves the state at 'disconnected': there's no change to announce
      if (!this.connectionManager.isDisconnected()) {
        await this.connectionManager.transitionTo('disconnected');
      }
      return;
    }
```

- [ ] **Step 4: Run the WebSocket tests to verify they pass**

Run: `pnpm test:nowatch tests/websocket`
Expected: PASS.

- [ ] **Step 5: Add the CHANGELOG entry**

Under `### Fixed`, after the Task 6 entry:

```markdown
- **`ws.connection.state`** is no longer published as `disconnected` → `disconnected` when a socket that never opened closes without `reconnect`.
```

- [ ] **Step 6: Format, check and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch
git add src/websocket/WebSocketHandler.ts tests/websocket/websocket-handler.test.ts CHANGELOG.md
git commit -m "WebSocketHandler: don't announce disconnected -> disconnected

A socket that never opened and then closed, without reconnect, published
ws.connection.state from disconnected to disconnected. The docs say the
event comes when the state changes, and disconnect() already skips the
transition when the state is disconnected; the close handler now does
too. ConnectionManager itself still publishes every transition it's
asked for.

Found by the docs audit (docs/demo-revamp-design.md, phase 1).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Memory-leak details list the subscriptions the warning counted

The warning counts the subscriptions to the exact event name or pattern (`count` = that name's subscription map size; the README says so), but the details come from `info(event)`, which lists every subscription whose name *matches* the event (for `user.*`, also `user.login`, `user.logout`, …) and counts middleware in "Total subscriptions". Verified while planning: the warning said 3 handlers for `user.*` while the details said 5 and listed ids of other subscriptions; with one global middleware, 11 vs 12.

**Files:**
- Modify: `src/eventEmitter.ts` (`checkForMemoryLeak`)
- Test: `tests/memoryLeak.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the failing test**

Add to `describe('Memory Leak Detection', …)` in `tests/memoryLeak.test.ts` (its `beforeEach` already mocks `console.warn`, `console.group`, `console.groupEnd` and `console.log`):

```typescript
  it('should list in the details only the subscriptions the warning counted', () => {
    evem.use((_event, data) => data); // middleware isn't a subscription
    evem.subscribe('user.login', () => {}); // matches user.* but subscribes to another name
    evem.enableMemoryLeakDetection({ threshold: 2 });

    const ids = [1, 2, 3].map(() => evem.subscribe('user.*', () => {}));

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('3 handlers added for event "user.*"'));
    const logged = vi.mocked(console.log).mock.calls.map(call => call.join(' '));
    expect(logged).toContain('Subscriptions to "user.*": 3');
    expect(logged.filter(line => line.startsWith('- '))).toEqual(ids.map(id => `- ${id} (priority: 0)`));
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:nowatch tests/memoryLeak.test.ts`
Expected: FAIL — the logged lines contain `Total subscriptions for "user.*" pattern: 5` instead of `Subscriptions to "user.*": 3`.

- [ ] **Step 3: Write the fix**

In `checkForMemoryLeak()` in `src/eventEmitter.ts`, replace:

```typescript
        const eventInfo = this.info(event);

        console.log(`Total subscriptions for "${event}" pattern: ${eventInfo.length}`);
        console.log('Subscription IDs:');

        eventInfo.forEach(info => {
          if (!info.isMiddleware && info.id) {
            console.log(`- ${info.id} (priority: ${info.priority})`);
          }
        });
```

with:

```typescript
        // The subscriptions the warning counted: those to this exact event name or pattern
        const subscriptions = this.events.get(event) ?? new Map<string, CallbackInfo>();

        console.log(`Subscriptions to "${event}": ${subscriptions.size}`);
        console.log('Subscription IDs:');

        subscriptions.forEach((info, id) => {
          console.log(`- ${id} (priority: ${info.priority})`);
        });
```

(`CallbackInfo` is the subscription record interface defined in `src/eventEmitter.ts`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:nowatch tests/memoryLeak.test.ts tests/info.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the CHANGELOG entry**

Under `### Fixed`, after the Task 7 entry:

```markdown
- **Memory-leak warning details** list the subscriptions the warning counted (those to that exact event name or pattern). They used to list every subscription whose name matched it, and to count middleware in the total.
```

- [ ] **Step 6: Format, check and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch
git add src/eventEmitter.ts tests/memoryLeak.test.ts CHANGELOG.md
git commit -m "Memory-leak details: list the subscriptions the warning counted

The warning counts the subscriptions to the exact event name or pattern,
but its details came from info(event), which lists every subscription
whose name matches it and counts middleware: the warning could say 3
handlers for user.* while the details said 5 and listed user.login's
subscriptions. The details now list exactly the counted subscriptions.

Found by the docs audit (docs/demo-revamp-design.md, phase 1).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Documentation fixes found by the audit

Each finding below was verified against `src/` (and most by running it) while planning. Every task ends with the docs checks from Tasks 3–4 still passing, so a fix can't break a sample's types or its `// Output:` comments. Line numbers are as of the start of this phase; find the text, not the line.

### Task 9: README.md

**Files:** Modify `README.md`.

- [ ] **Step 1: Make the redirect sample create its own emitter**

The sample under "Event Transformation and Redirection" uses `evem` without creating it, and the emitter from the sample just before it has a `user.*` middleware, so read in order its output would include "Processing user event: user.action" and an `audit` field. Replace its first line:

```typescript
import type { MiddlewareFunction } from "@jcfigueiredo/evem";
```

with:

```typescript
import { EvEm, type MiddlewareFunction } from "@jcfigueiredo/evem";
const evem = new EvEm();
```

- [ ] **Step 2: Say when a debounced call runs (Debouncing Events)**

The debounce timer starts during the publish, so with slow subscribers it can fire before `publish` resolves. Replace:

```markdown
A debounced call happens after `publish` has resolved, so it's outside the publish: `publish` doesn't wait for it, its errors are logged instead of going through the error policy, and the subscriber's transform isn't applied.
```

with:

```markdown
A debounced call runs on its own timer, not as part of the publish (usually after `publish` has resolved, but a slow subscriber can keep a publish running past `debounceTime`): `publish` doesn't wait for it, its errors are logged instead of going through the error policy, and the subscriber's transform isn't applied.
```

- [ ] **Step 3: Correct "Combining Throttle and Debounce"**

A debounced call doesn't count as "handled immediately", so an immediate call can follow it closely, and there's no trailing call when the last event was handled immediately. In the paragraph that starts "With both options, an event is handled immediately…", replace its last sentence:

```markdown
While events keep coming, the callback runs at the start of each throttle window, and once they stop, one more time with the last event:
```

with:

```markdown
Debounced calls don't count as handled immediately, so one can be followed closely by an immediate call. While events keep coming, the callback runs at the start of each throttle window, and once they stop, one more time with the last event, unless that event was handled immediately:
```

And in the sample below it, replace:

```typescript
// While the user types: suggest at most every 300ms, and once more 500ms after the last keystroke
```

with:

```typescript
// While the user types: suggest right away at the start of each 300ms window, and with the last
// keystroke once typing pauses for 500ms
```

- [ ] **Step 4: Correct the once + debounce sample (Combining Once with Other Options)**

The once wrapper is inside the debounce wrapper: each important notification restarts the timer, and the callback runs once with the *last* important notification of the first burst. Replace:

```typescript
// Only execute once, for the first important notification
```

with:

```typescript
// Run once, with the last important notification of the first burst
```

and:

```typescript
  debounceTime: 100 // In case multiple notifications arrive simultaneously
```

with:

```typescript
  debounceTime: 100 // Wait until important notifications stop arriving for 100ms
```

- [ ] **Step 5: Complete the list of cases where a transform doesn't run (Event Transformation)**

A transform shares its callback's `try`: when the callback throws or times out, the transform doesn't run. Replace:

```markdown
It doesn't run when its callback canceled the event.
```

with:

```markdown
It doesn't run when its callback canceled the event, threw or timed out; the next subscriber then gets the data unchanged.
```

- [ ] **Step 6: Make the timestamp middleware sample safe for every payload (When to Use Transformations vs. Middleware)**

Spreading a primitive or an array into an object replaces it (`5` became `{ timestamp }`, `[1, 2]` became `{ 0: 1, 1: 2, timestamp }`). Replace:

```typescript
evem.use((event: string, data: Record<string, unknown>) => {
  // Add timestamp to ALL events
  return { ...data, timestamp: Date.now() };
});
```

with:

```typescript
evem.use((event: string, data: unknown) => {
  // Add a timestamp to every object payload, and leave other payloads as they are
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }
  return { ...data, timestamp: Date.now() };
});
```

- [ ] **Step 7: Say when replayed events arrive (Using Event History and Replay)**

Filters are always checked asynchronously (`checkFilters` is `async`), so a subscription with filters, or with an async schema, gets its replayed events after `subscribe` returns. Replace:

```markdown
- Replay only happens if history is enabled when you subscribe. The callback is called right away, during `subscribe`, once for the last matching event (`replayLastEvent`) or for every matching event (`replayHistory`). A wildcard subscription replays every event its pattern matches.
```

with:

```markdown
- Replay only happens if history is enabled when you subscribe. It starts during `subscribe`, once for the last matching event (`replayLastEvent`) or for every matching event (`replayHistory`): the callback runs before `subscribe` returns, unless the subscription has filters (they're always checked asynchronously) or an async schema, which delay it a moment, or a debounce, which delays it by `debounceTime`. A wildcard subscription replays every event its pattern matches.
```

And in "API at Your Fingertips", replace:

```markdown
  - `options.replayLastEvent`: When true and history is enabled, immediately call the callback with the most recent matching event from history
  - `options.replayHistory`: When true and history is enabled, immediately call the callback with every matching event from history, oldest first
```

with:

```markdown
  - `options.replayLastEvent`: When true and history is enabled, call the callback with the most recent matching event from history when you subscribe
  - `options.replayHistory`: When true and history is enabled, call the callback with every matching event from history when you subscribe, oldest first
```

- [ ] **Step 8: `info()` lists subscriptions in subscription order (Using the Info Method for Debugging)**

Replace:

```markdown
4. Inspecting the priority order of event handlers
```

with:

```markdown
4. Inspecting the priorities of event handlers (listed in subscription order, not in the order they run)
```

- [ ] **Step 9: Mention `flush()` (WebSocket Adapter)**

`autoFlush: false` leaves `handler.flush()` as the only way to send the queue, and it isn't mentioned. In the configuration sample, replace:

```typescript
  autoFlush: true,             // Send queued messages once connected (default: true)
```

with:

```typescript
  autoFlush: true,             // Send queued messages once connected (default: true); else call handler.flush()
```

And in "API at Your Fingertips", under `WebSocketHandler`, replace:

```markdown
- `isConnected(): boolean`, `getConnectionState(): string`, `getQueueSize(): number`
- `disconnect(): Promise<void>`
```

with:

```markdown
- `isConnected(): boolean`, `getConnectionState(): string`, `getQueueSize(): number`
- `flush(): Promise<void>`: send the queued messages now (needed with `autoFlush: false`)
- `disconnect(): Promise<void>`
```

- [ ] **Step 10: Complete the SSE stop rules (Server-Sent Events Adapter)**

Every non-200 status except 408, 429 and 5xx stops the handler (201, 3xx included), and the EventSource transport can't see statuses at all. In the "What it publishes" paragraph, replace:

```markdown
By default the handler stops on `204`, on a response that isn't an event stream, and on `4xx` statuses other than `408` and `429`. Otherwise it reconnects
```

with:

```markdown
By default the handler stops on `204`, on a response that isn't an event stream, and on any status other than `200`, except `408`, `429` and `5xx` (the `eventsource` transport can't see statuses: it reconnects whenever the browser gives up). Otherwise it reconnects
```

- [ ] **Step 11: Run the docs checks**

Run: `pnpm test:nowatch tests/docs`
Expected: PASS (the type-check covers the edited samples; the output check covers the redirect sample, which still prints exactly its two documented lines).

- [ ] **Step 12: Commit**

```bash
git add README.md
git commit -m "README: fix what the docs audit found

- The redirect sample creates its own emitter; read in order, it used
  the previous sample's, whose user.* middleware changed its output.
- A debounced call can run before publish resolves (its timer starts
  during the publish).
- Throttle + debounce: debounced calls don't start a throttle window,
  and there's no trailing call when the last event was handled
  immediately.
- once + debounce runs with the last important notification of the
  first burst, not the first one.
- A transform doesn't run when its callback throws or times out.
- The timestamp middleware sample no longer turns primitive and array
  payloads into objects.
- Replay reaches subscriptions with filters, an async schema or a
  debounce after subscribe returns.
- info() lists subscriptions in subscription order.
- handler.flush() is documented.
- The SSE stop rules cover every non-200 status and the EventSource
  transport.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: docs/examples.md

**Files:** Modify `docs/examples.md`.

- [ ] **Step 1: A throwing middleware also cancels (Publishing an Event)**

Replace:

```markdown
(by a subscriber of a cancelable event, by middleware returning `null`, or by the `CANCEL_ON_ERROR` error policy).
```

with:

```markdown
(by a subscriber of a cancelable event, by middleware returning `null` or throwing, or by the `CANCEL_ON_ERROR` error policy).
```

- [ ] **Step 2: Give the multi-step validation sample its own event name (Multi-step Validation with Cancelable Events)**

The core examples share one `evem`, and the Wildcard section's `user.*` subscriber also receives `user.register`, so run in order the sample prints a "User event occurred" line its comments don't show. In that sample only, replace each of the four `"user.register"` with `"account.register"` (three `evem.subscribe` calls and the `evem.publish` call).

- [ ] **Step 3: Mention the reserved names (WebSocket Adapter Examples)**

Replace:

```markdown
Only the payload is sent, as JSON; the event name is not.
```

with:

```markdown
Only the payload is sent, as JSON; the event name is not. Names containing `queued` are reserved for the queue.
```

- [ ] **Step 4: Say what happens to a request that times out while queued (Request-Response with Timeout)**

Replace:

```markdown
Requests made while offline are queued like other messages and sent when the socket opens, but their timeout starts when `request()` is called.
```

with:

```markdown
Requests made while offline are queued like other messages and sent when the socket opens, but their timeout starts when `request()` is called. A request that times out while it's still queued is sent anyway when the socket opens, and its response is ignored.
```

- [ ] **Step 5: Run the docs checks and commit**

```bash
pnpm test:nowatch tests/docs
git add docs/examples.md
git commit -m "docs/examples.md: fix what the docs audit found

- A throwing middleware also makes publish resolve false.
- The multi-step validation sample uses account.register: the shared
  emitter's user.* subscriber from the Wildcard section also received
  user.register and added a line to its output.
- ws.send.* names containing queued are reserved for the queue.
- A request that times out while queued is still sent, and its
  response ignored.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: docs/websocket-adapter.md and docs/websocket-server-events.md

**Files:** Modify `docs/websocket-adapter.md`, `docs/websocket-server-events.md`.

- [ ] **Step 1: Publishing `ws.send.queued` is what sends the message (Events and Offline queue)**

In the events table, replace:

```markdown
| `ws.send.queued` | the queued payload | For each queued message as the queue is flushed, just before it's sent. |
```

with:

```markdown
| `ws.send.queued` | the queued payload | For each queued message as the queue is flushed. Publishing it is what sends it (the handler's own subscriber sends it), so middleware sees it before it's sent and subscribers you add usually after. |
```

And in "Offline queue", replace:

```markdown
Each flushed message is published as `ws.send.queued` and then sent.
```

with:

```markdown
Each flushed message is published as `ws.send.queued`, which sends it.
```

- [ ] **Step 2: Reconnecting a socket you created (Node.js)**

Replace:

```markdown
If you also want reconnection, set `WebSocketConstructor` as well. Reconnections create new sockets from the socket's `url` using that class, or the global `WebSocket` if it isn't set, and Node.js 20 has no global `WebSocket`.
```

with:

```markdown
If you also want reconnection, set `reconnect: true` and `WebSocketConstructor`. Reconnections create new sockets with `new WebSocketConstructor(socket.url)` (or the global `WebSocket` if it isn't set, and Node.js 20 has no global `WebSocket`), so options you gave your socket, like headers or protocols, aren't reused: use a subclass like `AuthenticatedSocket` above.
```

- [ ] **Step 3: Add `wasQueued` to the MessageQueue declaration and use it in "Wiring them up"**

`WebSocketHandler` doesn't send a message the queue's middleware queued during the same publish; the wiring sample does, so a message published while offline is sent twice if the socket opens before that publish finishes (verified with a fake socket and an async middleware). In the `declare class MessageQueue` block, replace:

```typescript
  getMaxSize(): number;
}
```

with:

```typescript
  getMaxSize(): number;
  wasQueued(data: unknown): boolean; // whether the middleware queued this payload on its latest publish
}
```

And in the wiring sample, replace:

```typescript
function sendOrQueue(message: unknown, fromQueue: boolean): void {
  if (socket?.readyState === WebSocket.OPEN) {
```

with:

```typescript
function sendOrQueue(message: unknown, fromQueue: boolean): void {
  // Queued by the middleware during this publish, because we were offline: the flush sends it,
  // even if the socket has opened since
  if (!fromQueue && queue.wasQueued(message)) return;
  if (socket?.readyState === WebSocket.OPEN) {
```

- [ ] **Step 4: The prefix rule (docs/websocket-server-events.md)**

Replace:

```markdown
It's added unless the name already starts with it.
```

with:

```markdown
It's added unless the name already starts with `<prefix>.`: `server.user.login` stays as it is, and `serverless.deploy` becomes `server.serverless.deploy`.
```

- [ ] **Step 5: Run the docs checks and commit**

```bash
pnpm test:nowatch tests/docs
git add docs/websocket-adapter.md docs/websocket-server-events.md
git commit -m "WebSocket docs: fix what the docs audit found

- Publishing ws.send.queued is what sends a flushed message.
- Reconnecting a socket you created needs reconnect: true, and new
  sockets get only the URL.
- The Wiring them up sample skips messages the queue's middleware just
  queued (MessageQueue.wasQueued, now in the declaration); it sent a
  message twice if the socket opened during its publish.
- The server event prefix is skipped only for names that start with
  <prefix>.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: docs/sse-adapter.md

**Files:** Modify `docs/sse-adapter.md`.

- [ ] **Step 1: `maxReconnectDelay` is a cap before jitter (Options)**

Replace:

```markdown
| `maxReconnectDelay` | `30000` | Upper limit for the backed-off delay, in ms. |
```

with:

```markdown
| `maxReconnectDelay` | `30000` | Cap for the backed-off delay, in ms, before jitter: with `backoff`, the actual delay can be up to 20% longer. |
```

- [ ] **Step 2: State-change publishes that reject are ignored (Events)**

Replace:

```markdown
A publish that rejects (e.g. because of a `schemaErrorPolicy: THROW` subscriber) is logged with `console.error` rather than left as an unhandled rejection.
```

with:

```markdown
A publish that rejects (e.g. because of a `schemaErrorPolicy: THROW` subscriber) is logged with `console.error` rather than left as an unhandled rejection, except for `sse.connection.state`: a rejected state-change publish is ignored silently, and the state change still happens.
```

- [ ] **Step 3: The heartbeat and `sequential` (Heartbeat timeout)**

Replace:

```markdown
The timer starts with the request and restarts when the response arrives and with every chunk received. It's off by default and isn't available with the EventSource transport. A custom transport supports it if it calls `activity()`.
```

with:

```markdown
The timer starts with the request and restarts when the response arrives and with every chunk received. It's off by default and isn't available with the EventSource transport. A custom transport supports it if it calls `activity()`. With `sequential: true`, the time spent waiting for an event's subscribers counts too, because nothing is read meanwhile: keep the timeout well above how long they can take.
```

- [ ] **Step 4: The id doesn't carry over in an EventSource the handler creates (Resuming with Last-Event-ID)**

After the paragraph that starts "As in the SSE specification, an id carries over to later events that don't have one", add a paragraph:

```markdown
With the EventSource transport, the id carries over only within one browser `EventSource`. In an `EventSource` the handler creates (the first one, with the `lastEventId` option, and each one after the browser gives up), an event without an `id:` clears the last event id, so give every event an id if you rely on resuming.
```

- [ ] **Step 5: `204` isn't reported (Server checklist)**

Replace:

```markdown
the handler stops (and reports the status).
```

with:

```markdown
the handler stops in both cases, and reports `401`/`403` as `sse.error` with the status (a `204` is a normal end and isn't reported).
```

- [ ] **Step 6: A fake `fetch` must honour the abort signal (Testing)**

Replace:

```markdown
For a stream that stays open, build the body as a `ReadableStream` and keep its controller to `enqueue()` chunks, `close()` or `error()` it during the test.
```

with:

```markdown
For a stream that stays open, build the body as a `ReadableStream` and keep its controller to `enqueue()` chunks, `close()` or `error()` it during the test. Make it honour `init.signal`: when the signal aborts, reject the pending `fetch` and `error()` the body's controller, as a real `fetch` does. Otherwise `disconnect()` and `heartbeatTimeout` can't end the connection.
```

- [ ] **Step 7: Run the docs checks and commit**

```bash
pnpm test:nowatch tests/docs
git add docs/sse-adapter.md
git commit -m "docs/sse-adapter.md: fix what the docs audit found

- maxReconnectDelay caps the delay before jitter (up to 20% more).
- Rejected sse.connection.state publishes are ignored, not logged.
- With sequential: true, time spent in subscribers counts toward
  heartbeatTimeout.
- In an EventSource the handler creates, an event without an id clears
  the last event id.
- 204 stops the handler without an sse.error.
- A fake fetch in tests must honour the abort signal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: CLAUDE.md, the spec's status, and the full check

**Files:** Modify `CLAUDE.md`, `docs/demo-revamp-design.md`.

- [ ] **Step 1: Describe the docs checks in CLAUDE.md**

In `CLAUDE.md` → "Testing Strategy", after the `tests/demo/` bullet, add:

```markdown
- `tests/docs/`: the samples in the README and the docs. `samples.typecheck.test.ts` type-checks every `typescript` / `ts` / `tsx` block of the documents in `TYPESCRIPT_DOCS` (`codeBlocks.ts`) against `src/` with the repository's compiler options (`typeCheck.ts`: TypeScript compiler API, package names mapped to `src/`); `preludes/*.d.ts` declare what each document's samples use without defining (excluded from `tsconfig.json`, since they declare the same globals). `readme.outputs.test.ts` runs every README block with `// Output:` / `// Logs:` comments, with fake timers, and checks that it prints those lines in order (`outputs.ts`: whitespace is loose, `'…'` is any quoted string, a trailing `...` the rest of the line, and notes go after `<-`). A block that is deliberately a fragment carries `// docs-check: fragment`
```

- [ ] **Step 2: Update the WebSocketHandler lifecycle in CLAUDE.md**

In the `**Lifecycle**` bullet of `WebSocketHandler`, replace:

```markdown
an unexpected `onclose` → `disconnected`, or with `reconnect: true`
```

with:

```markdown
an unexpected `onclose` → `disconnected` (no event if it already is), or with `reconnect: true`
```

and replace:

```markdown
`onerror`, or a socket that can't be created while reconnecting → `ws.error` and the `onError` option.
```

with:

```markdown
`onerror`, or a socket that can't be created while reconnecting → `ws.error` and the `onError` option. An `error` on a socket that never opened also counts as the failed attempt, once (Node.js 22's built-in WebSocket sends no `close` then): that socket's handlers come off, so a `close` after it is ignored.
```

- [ ] **Step 3: Mark phase 1 done in the spec**

In `docs/demo-revamp-design.md`, replace the status line's first sentence:

```markdown
> **Status: design approved, not implemented.**
```

with:

```markdown
> **Status: phase 1 (examples audit) implemented; phases 2–5 not started.**
```

- [ ] **Step 4: Run everything CI runs**

```bash
pnpm format && pnpm check
```

Expected: `pnpm check` passes: format check, typecheck, all tests (the docs checks included; the Node.js built-in WebSocket test runs on Node 22 and is skipped on Node 20) and the package check.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/demo-revamp-design.md
git commit -m "CLAUDE.md: describe the docs checks and the WebSocket error handling

Also marks phase 1 of the demo revamp as done in its design.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
