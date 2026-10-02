import { ErrorPolicy, EvEm, Priority } from "~/eventEmitter";
import { extractCodeSamples, listDemoPages, readDemoPage } from "./demoPages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests: the demo pages' "View Code" samples must only use the real EvEm API.
 * Several samples called methods and options that only existed in the pages' simplified inline
 * copies (getHistory, setSchema, setErrorPolicy, publishCancelable, replayLast, middleware next(), ...).
 */

/** APIs that only existed in the demo pages' inline copies, with what the real library offers instead */
const FAKE_APIS: ReadonlyArray<readonly [pattern: RegExp, description: string]> = [
  [/\bgetHistory\s*\(/, "getHistory() - use getEventHistory(pattern?)"],
  [/\benableHistory\(\s*['"`{]/, "enableHistory(pattern, options) - use enableHistory(maxEvents?)"],
  [/\breplayLast(?!Event)\b/, "replayLast option - use replayLastEvent"],
  [/\bsetSchema\s*\(/, "setSchema() - use the `schema` subscribe option"],
  [/\bsetErrorPolicy\s*\(/, "setErrorPolicy() - use schemaErrorPolicy / the publish errorPolicy option"],
  [/\bpublishCancelable\s*\(/, "publishCancelable() - use publish(event, data, { cancelable: true })"],
  [/\bcancelledBy\b/, "cancelledBy - a cancelable publish resolves to a boolean"],
  [/\.cancelled\b/, "result.cancelled - a cancelable publish resolves to a boolean"],
  [/\.cancel\(\s*[^)\s]/, "cancel(reason) - cancel() takes no arguments"],
  [/\bnext\(\)/, "middleware next() - middleware returns the data (or null to cancel)"],
  [/,\s*next\s*\)\s*=>/, "middleware `next` parameter - middleware is (event, data) => data"],
  [/\.use\(\s*['"`]/, "use(pattern, fn) - use use({ pattern, handler })"],
];

interface CodeSample {
  /** Id of the element containing the sample, e.g. 'history-code' */
  id: string;
  code: string;
}

/** A page's "View Code" samples, each identified by the id of the nearest element before it */
function samplesOf(file: string): CodeSample[] {
  const html = readDemoPage(file);
  const samples = extractCodeSamples(html);
  const starts = [...html.matchAll(/<pre>\s*<code\b/gi)].map(match => match.index ?? 0);
  return samples.map((code, i) => {
    const ids = [...html.slice(0, starts[i]).matchAll(/\bid="([^"]+)"/g)];
    return { id: ids[ids.length - 1]?.[1] ?? `sample-${i}`, code };
  });
}

const allSamples = listDemoPages().flatMap(file => samplesOf(file).map(sample => ({ file, ...sample })));

describe("demo pages: View Code samples", () => {
  it("finds the samples", () => {
    expect(allSamples.length).toBeGreaterThan(20);
  });

  describe.each(allSamples.map(sample => [`${sample.file} #${sample.id}`, sample] as const))("%s", (_, sample) => {
    it("uses no APIs that only exist in the demos' inline copies", () => {
      const fakeApisUsed = FAKE_APIS
        .filter(([pattern]) => pattern.test(sample.code))
        .map(([, description]) => description);
      expect(fakeApisUsed).toEqual([]);
    });

    it("only calls methods that exist on the real EvEm", () => {
      const methods = [...sample.code.matchAll(/\bevem\.(\w+)\s*\(/g)].map(match => match[1] ?? "");
      const missing = methods.filter(name => typeof (EvEm.prototype as any)[name] !== "function");
      expect(missing).toEqual([]);
    });
  });
});

/** Format console.log arguments the way they read in the samples' comments */
function formatLogLine(args: unknown[]): string {
  return args.map(arg => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
}

const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as
  new (...params: string[]) => (...args: unknown[]) => Promise<unknown>;

/** Run a sample against a fresh real EvEm and return what it logged with console.log */
async function runSample(code: string): Promise<string[]> {
  const logged: string[] = [];
  const globals: Record<string, unknown> = {
    evem: new EvEm(),
    EvEm,
    ErrorPolicy,
    Priority,
    console: { log: (...args: unknown[]) => { logged.push(formatLogLine(args)); }, error: () => undefined },
    // Placeholder the error recovery sample calls
    fallbackApi: { call: async () => ({ ok: true }) },
  };
  // Imports are illustrative; the sample gets EvEm, ErrorPolicy and Priority as globals
  const body = code.replace(/^\s*import\s[^\n]*$/gm, "");
  const run = new AsyncFunction(...Object.keys(globals), body);
  await run(...Object.values(globals));
  return logged;
}

/**
 * What each sample on the pages whose samples used fake APIs logs when run against the real library
 * (the values the samples' own comments promise)
 */
const EXPECTED_SAMPLE_OUTPUT: Record<string, Record<string, ReadonlyArray<string | RegExp>>> = {
  "history-replay.html": {
    "history-code": [/^\[\{"event":"user\.action","data":\{"action":"login","userId":123\},"timestamp":\d+\}\]$/],
    "replayLast-code": ['Received: {"status":"online","server":"main-01"}'],
    "replayHistory-code": ["Alice: Hello!", "Bob: Hi!", "Charlie: Hey!"],
    "timeline-code": [],
    "lateSync-code": ["Alice: Hello!", "Bob: Hi there!"],
  },
  "middleware-transforms.html": {
    "global-code": ["Middleware: user.login", 'Login handler: {"user":"Alice"}', "Middleware: system.update"],
    "pattern-code": [
      /^API handler: \{"userId":123,"timestamp":\d+,"requestId":"\w*"\}$/,
      /^API handler: \{"title":"Hello","timestamp":\d+,"requestId":"\w*"\}$/,
    ],
    "transform-code": ["Original: hello world", "Received: HELLO WORLD"],
    "chain-code": ["Step 1:   hello world  ", "Step 2: hello world", "Step 3: HELLO WORLD"],
    "cancel-code": ["Deleted user: 123"],
  },
  "schema-validation.html": {
    "simple-code": ["User created: alice123"],
    "advanced-code": ["Payment processed: 99.99 USD"],
    "policy-code": ['Handler ran with: {"valid":false}'],
    "type-code": ["Data submitted: Test Item"],
    "custom-code": ["Contact added: John Doe"],
  },
  "cancelable-errors.html": {
    "cancelable-code": ["Deleting user: 123"],
    "policy-code": ["Handler 2 still runs"],
    "validation-code": ["Data saved: TestUser"],
    "permission-code": ["Executing admin action: Delete database"],
    "recovery-code": ["Attempting primary API...", "Attempting fallback API..."],
  },
};

describe("demo pages: View Code samples run against the real library", () => {
  beforeEach(() => {
    // The real library logs schema failures and handler errors the samples demonstrate
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each(Object.entries(EXPECTED_SAMPLE_OUTPUT))("%s", (file, expectedById) => {
    const samples = samplesOf(file);

    it("has an expected output for every sample", () => {
      expect(samples.map(sample => sample.id).sort()).toEqual(Object.keys(expectedById).sort());
    });

    it.each(samples.map(sample => [sample.id, sample] as const))("#%s runs and logs what its comments say", async (id, sample) => {
      const logged = await runSample(sample.code);

      const expected = (expectedById[id] ?? []).map(line => (typeof line === "string" ? line : expect.stringMatching(line)));
      expect(logged).toEqual(expected);

      // Comments like `console.log('Step 1:', data.value); // "hello world"` promise a logged value
      const promised = [...sample.code.matchAll(/console\.log\(\s*'([^']+)'[^;]*;\s*\/\/\s*"([^"]*)"/g)]
        .map(match => `${match[1]} ${match[2]}`);
      expect(logged).toEqual(expect.arrayContaining(promised));
    });
  });
});
