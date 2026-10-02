import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { ErrorPolicy, EvEm, Priority } from "~/eventEmitter";
import * as mainEntry from "~/index";
import * as sseEntry from "~/sse/index";
import * as sseServerEntry from "~/sse/server";
import { SseParser, type SseParsedEvent } from "~/sse/SseParser";
import { extractCodeSamples, findMatchingBrace, listDemoPages, loadInlineDeclarations, readDemoPage } from "./demoPages";
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
  /** From the code element's `language-*` class ('javascript' when it has none) */
  language: string;
  code: string;
}

/** A page's "View Code" samples, each identified by the id of the nearest element before it */
function samplesOf(file: string): CodeSample[] {
  const html = readDemoPage(file);
  const samples = extractCodeSamples(html);
  const starts = [...html.matchAll(/<pre>\s*<code\b([^>]*)>/gi)].map(match => ({ index: match.index ?? 0, attributes: match[1] ?? "" }));
  return samples.map((code, i) => {
    const ids = [...html.slice(0, starts[i]?.index).matchAll(/\bid="([^"]+)"/g)];
    const language = /\blanguage-(\w+)/.exec(starts[i]?.attributes ?? "")?.[1] ?? "javascript";
    return { id: ids[ids.length - 1]?.[1] ?? `sample-${i}`, language, code };
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

    it("only imports names the package's entry points export", () => {
      expect(missingImports(sample.code)).toEqual([]);
    });
  });
});

/** The package's entry points, as samples import them */
const ENTRY_POINTS: Record<string, object> = {
  "@jcfigueiredo/evem": mainEntry,
  "@jcfigueiredo/evem/sse": sseEntry,
  "@jcfigueiredo/evem/sse/server": sseServerEntry,
};

/** `name from 'module'` for each name a sample imports from the package that the module doesn't export */
function missingImports(code: string): string[] {
  const missing: string[] = [];
  for (const match of code.matchAll(/^\s*import\s*\{([^}]*)\}\s*from\s*['"](@jcfigueiredo\/evem[^'"]*)['"]/gm)) {
    const module = match[2] ?? "";
    const entry = ENTRY_POINTS[module];
    for (const name of (match[1] ?? "").split(",").map(part => part.trim().split(/\s+as\s+/)[0] ?? "").filter(Boolean)) {
      if (!entry || !(name in entry)) missing.push(`${name} from ${module}`);
    }
  }
  return missing;
}

// -------------------------------------------------------------------------------------------------
// The SSE page's samples, checked against the real SSE adapter
// -------------------------------------------------------------------------------------------------

const REPO_ROOT = new URL("../../", import.meta.url);

/** Split `text` at the commas that aren't inside brackets, strings or template literals */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if ("([{".includes(ch)) {
      depth++;
    } else if (")]}".includes(ch)) {
      depth--;
    } else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

/** The arguments of every call to `callee(` in `code` */
function callArguments(code: string, callee: string): string[][] {
  const calls: string[][] = [];
  for (const match of code.matchAll(new RegExp(`${callee.replace(/[.]/g, "\\.")}\\s*\\(`, "g"))) {
    const open = (match.index ?? 0) + match[0].length - 1;
    calls.push(splitTopLevel(code.slice(open + 1, findMatchingBrace(code, open, "(", ")"))));
  }
  return calls;
}

/** The keys of an object literal argument (`{ a: 1, b, ...c }` → a, b), or [] if it isn't one */
function literalKeys(argument: string | undefined): string[] {
  if (!argument?.startsWith("{")) return [];
  const body = argument.slice(1, -1).replace(/\/\/[^\n]*/g, "");
  return splitTopLevel(body)
    .filter(entry => !entry.startsWith("..."))
    .map(entry => /^['"]?([\w$]+)['"]?\s*(?::|\(|$)/.exec(entry)?.[1] ?? entry);
}

/** The optional members of an exported interface in a source file */
function interfaceKeys(file: string, name: string): string[] {
  const source = readFileSync(new URL(file, REPO_ROOT), "utf8");
  const start = source.indexOf(`export interface ${name} {`);
  const open = source.indexOf("{", start);
  const body = source.slice(open + 1, findMatchingBrace(source, open));
  return [...body.matchAll(/^\s*(\w+)\??:/gm)].map(match => match[1] ?? "");
}

const SSE_PAGE = "sse-demo.html";
const sseSamples = samplesOf(SSE_PAGE);
const sseSample = (id: string) => sseSamples.find(sample => sample.id === id)?.code ?? "";
const jsSseSamples = sseSamples.filter(sample => sample.language === "javascript");

/** The reference Python helper's API (examples/python/evem_sse.py) */
const PYTHON_HELPER_NAMES = ["format_sse_message", "format_sse_comment", "SSE_HEADERS"];
const PYTHON_FORMAT_KEYWORDS = ["event", "data", "id", "retry", "raw", "envelope"];

describe(`${SSE_PAGE}: View Code samples use the real SSE API`, () => {
  it("has the client, app, Node.js server and Python server samples", () => {
    expect(sseSamples.map(sample => [sample.id, sample.language])).toEqual([
      ["client-code", "javascript"],
      ["node-code", "javascript"],
      ["python-code", "python"],
      ["app-code", "javascript"],
    ]);
  });

  it.each(jsSseSamples.map(sample => [sample.id, sample] as const))("#%s only calls methods that exist on the real SseHandler", (_, sample) => {
    const methods = [...sample.code.matchAll(/\bsse\.(\w+)\s*\(/g)].map(match => match[1] ?? "");
    const missing = methods.filter(name => typeof (sseEntry.SseHandler.prototype as any)[name] !== "function");
    expect(missing).toEqual([]);
  });

  it("imports SseHandler and the server helpers from their entry points", () => {
    expect(sseSample("client-code")).toMatch(/import \{ SseHandler \} from '@jcfigueiredo\/evem\/sse';/);
    expect(sseSample("node-code")).toMatch(/import \{ formatSseComment, formatSseMessage, SSE_HEADERS \} from '@jcfigueiredo\/evem\/sse\/server';/);
    for (const sample of jsSseSamples) {
      expect(missingImports(sample.code)).toEqual([]);
    }
  });

  it("only passes SseHandlerOptions to new SseHandler()", () => {
    const optionNames = interfaceKeys("src/sse/SseHandler.ts", "SseHandlerOptions");
    expect(optionNames).toContain("heartbeatTimeout");
    const calls = jsSseSamples.flatMap(sample => callArguments(sample.code, "new SseHandler"));
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) {
      expect(literalKeys(args[2]).filter(key => !optionNames.includes(key))).toEqual([]);
    }
  });

  it("only passes SseMessage fields and FormatSseMessageOptions to formatSseMessage()", () => {
    const messageFields = interfaceKeys("src/sse/format.ts", "SseMessage");
    const optionNames = interfaceKeys("src/sse/format.ts", "FormatSseMessageOptions");
    expect(messageFields).toEqual(["event", "data", "id", "retry"]);
    const calls = jsSseSamples.flatMap(sample => callArguments(sample.code.replace(/^\s*\/\/\s?/gm, ""), "formatSseMessage"));
    expect(calls.length).toBeGreaterThan(2);
    for (const [message, options] of calls) {
      expect(literalKeys(message).filter(key => !messageFields.includes(key))).toEqual([]);
      expect(literalKeys(options).filter(key => !optionNames.includes(key))).toEqual([]);
    }
  });

  describe("the Python sample", () => {
    const python = sseSample("python-code");

    it("imports only the reference helper's names from evem_sse", () => {
      const imports = /^from evem_sse import (.+)$/m.exec(python)?.[1]?.split(",").map(name => name.trim()) ?? [];
      expect(imports.sort()).toEqual([...PYTHON_HELPER_NAMES].sort());
    });

    it("calls format_sse_message only with its keyword arguments", () => {
      const calls = callArguments(python.replace(/^\s*#\s?/gm, ""), "format_sse_message");
      expect(calls.length).toBeGreaterThan(3);
      const keywords = calls.flat().map(argument => /^(\w+)\s*=(?!=)/.exec(argument)?.[1]).filter(Boolean);
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.filter(keyword => !PYTHON_FORMAT_KEYWORDS.includes(keyword!))).toEqual([]);
    });

    const helperFile = new URL("examples/python/evem_sse.py", REPO_ROOT);
    it.runIf(existsSync(helperFile))("uses names that examples/python/evem_sse.py defines", () => {
      const helper = readFileSync(helperFile, "utf8");
      expect(helper).toMatch(/^def format_sse_message\(/m);
      expect(helper).toMatch(/^def format_sse_comment\(/m);
      expect(helper).toMatch(/^SSE_HEADERS\b/m);
      const signature = /^def format_sse_message\(([\s\S]*?)\)\s*(?:->[^:]*)?:/m.exec(helper)?.[1] ?? "";
      for (const keyword of PYTHON_FORMAT_KEYWORDS) {
        expect(signature).toMatch(new RegExp(`\\b${keyword}\\b`));
      }
    });

    const hasPython = (() => {
      try {
        execFileSync("python3", ["--version"], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();
    it.runIf(hasPython)("is valid Python", () => {
      expect(() => execFileSync("python3", ["-c", "import ast, sys; ast.parse(sys.stdin.read())"], { input: python, stdio: ["pipe", "ignore", "pipe"] }))
        .not.toThrow();
    });
  });
});

const AsyncFunctionConstructor = Object.getPrototypeOf(async () => undefined).constructor as
  new (...params: string[]) => (...args: unknown[]) => Promise<any>;

/** Strip the import lines of a sample: the runner passes what they import as parameters */
const withoutImports = (code: string) => code.replace(/^\s*import\s[^\n]*$/gm, "");

describe(`${SSE_PAGE}: View Code samples run against the real library`, () => {
  const { SimulatedSseServer } = loadInlineDeclarations(SSE_PAGE, ["SSE_HEADERS", "assertSingleLine", "formatSseMessage", "formatSseComment", "SimulatedSseServer"]);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the client and app samples connect with the token, receive server.* and sse.* events, save the id and sign out", async () => {
    const requests: Array<{ authorization: string | null; lastEventId: string | null }> = [];
    const server = new SimulatedSseServer({ onRequest: (request: any) => { requests.push(request); } });
    server.start();
    vi.stubGlobal("fetch", server.fetch);
    // The sample is browser code: its relative URL resolves against the page
    vi.stubGlobal("location", { href: "http://localhost/app/" });

    const seen: Record<string, unknown[]> = { status: [], offline: [], price: [], order: [], notice: [], warn: [] };
    const pageListeners: Record<string, () => void> = {};
    const stored: Record<string, string> = {};
    const globals: Record<string, unknown> = {
      EvEm,
      SseHandler: sseEntry.SseHandler,
      getToken: () => "token-123",
      showStatus: (from: string, to: string) => { seen.status!.push(`${from}->${to}`); },
      showOffline: (attempts: number) => { seen.offline!.push(attempts); },
      renderPrice: (price: unknown) => { seen.price!.push(price); },
      renderOrder: (order: unknown) => { seen.order!.push(order); },
      showNotice: (notice: unknown) => { seen.notice!.push(notice); },
      console: { warn: (...args: unknown[]) => { seen.warn!.push(args.join(" ")); }, log: () => undefined, error: () => undefined },
      window: { addEventListener: (type: string, listener: () => void) => { pageListeners[type] = listener; } },
      sessionStorage: { setItem: (key: string, value: string) => { stored[key] = value; } },
    };
    const body = `${withoutImports(sseSample("client-code"))}\n${sseSample("app-code")}\nreturn { sse, signOut };`;
    const { sse, signOut } = await new AsyncFunctionConstructor(...Object.keys(globals), body)(...Object.values(globals));

    await vi.advanceTimersByTimeAsync(300);
    expect(sse.getConnectionState()).toBe("connected");
    expect(requests[0]).toMatchObject({ authorization: "Bearer token-123", lastEventId: null });

    server.sendOrder();
    server.sendOrder({ envelope: true });
    server.sendNotice();
    server.tick();
    server.sendMalformed();
    await vi.advanceTimersByTimeAsync(10);
    expect(seen.order).toEqual([
      { id: 1001, item: "Keyboard", status: "placed" },
      { id: 1001, item: "Keyboard", status: "paid" },
    ]);
    expect(seen.notice).toEqual([{ text: "Maintenance tonight at 22:00 UTC", level: "info" }]);
    expect(seen.price).toEqual([{ symbol: "EVM", price: 100, change: 0 }]);
    expect(seen.warn).toEqual(['Not JSON: price.updated {"symbol":"EVM","price":']);

    // A restart answered with 401 stops the client and reports it
    server.restartWith(401);
    await vi.advanceTimersByTimeAsync(5000);
    expect(requests[1]).toMatchObject({ authorization: "Bearer token-123", lastEventId: "5" });
    expect(seen.warn).toContain("SSE http-error 401 SSE request failed with HTTP 401");
    expect(sse.getConnectionState()).toBe("disconnected");

    pageListeners.pagehide?.();
    expect(stored).toEqual({ "orders-stream:last-event-id": "5" });

    sse.connect();
    await vi.advanceTimersByTimeAsync(300);
    await signOut();
    expect(seen.status).toEqual([
      "disconnected->connecting", "connecting->connected", "connected->reconnecting", "reconnecting->connecting",
      "connecting->disconnected", "disconnected->connecting", "connecting->connected", "connected->disconnecting",
      "disconnecting->disconnected",
    ]);
    expect(seen.offline).toEqual([]);
    server.stop();
  });

  it("the Node.js sample answers 401/404, streams, pings, and replays only what follows Last-Event-ID", async () => {
    let handler: (req: unknown, res: unknown) => void = () => undefined;
    const globals: Record<string, unknown> = {
      createServer: (requestHandler: typeof handler) => {
        handler = requestHandler;
        return { listen: () => undefined };
      },
      isAuthorized: (authorization: string | undefined) => authorization === "Bearer ok",
      formatSseMessage: sseServerEntry.formatSseMessage,
      formatSseComment: sseServerEntry.formatSseComment,
      SSE_HEADERS: sseServerEntry.SSE_HEADERS,
    };
    const { broadcast } = await new AsyncFunctionConstructor(...Object.keys(globals), `${withoutImports(sseSample("node-code"))}\nreturn { broadcast };`)(...Object.values(globals));

    const connect = (headers: Record<string, string>, url = "/api/events") => {
      const closeListeners: Array<() => void> = [];
      const res = {
        status: 0,
        headers: undefined as unknown,
        written: "",
        ended: false,
        writeHead(status: number, responseHeaders?: unknown) { this.status = status; this.headers = responseHeaders; return this; },
        write(text: string) { this.written += text; return true; },
        end() { this.ended = true; return this; },
      };
      handler({ url, headers, on: (event: string, listener: () => void) => { if (event === "close") closeListeners.push(listener); } }, res);
      const events = () => {
        const parsed: SseParsedEvent[] = [];
        const parser = new SseParser({ onEvent: event => parsed.push(event) });
        parser.feed(res.written);
        return parsed.map(({ type, data, lastEventId }) => [type, JSON.parse(data), lastEventId]);
      };
      return { res, events, close: () => closeListeners.forEach(listener => listener()) };
    };

    expect(connect({ authorization: "Bearer ok" }, "/other").res).toMatchObject({ status: 404, ended: true, written: "" });
    expect(connect({ authorization: "Bearer wrong" }).res).toMatchObject({ status: 401, ended: true, written: "" });

    // The sample broadcast event 1 before anyone connected: a new client doesn't get it, only its id
    const fresh = connect({ authorization: "Bearer ok" });
    expect(fresh.res.status).toBe(200);
    expect(fresh.res.headers).toEqual(sseServerEntry.SSE_HEADERS);
    expect(fresh.res.written).toBe("retry: 2000\n\nid: 1\n\n");

    broadcast("price.updated", { price: 1 });
    broadcast("price.updated", { price: 2 });
    expect(fresh.events()).toEqual([["price.updated", { price: 1 }, "2"], ["price.updated", { price: 2 }, "3"]]);

    // A client resuming after id 1 gets events 2 and 3, then live ones
    const resumed = connect({ authorization: "Bearer ok", "last-event-id": "1" });
    broadcast("order.updated", { id: 7 });
    expect(resumed.events()).toEqual([
      ["price.updated", { price: 1 }, "2"], ["price.updated", { price: 2 }, "3"], ["order.updated", { id: 7 }, "4"],
    ]);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(fresh.res.written.endsWith(": ping\n\n")).toBe(true);

    // After the client goes away: no more pings or events
    fresh.close();
    const before = fresh.res.written;
    broadcast("order.updated", { id: 8 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fresh.res.written).toBe(before);
    resumed.close();
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
