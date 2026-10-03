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
