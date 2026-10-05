// Checks the package as users get it: packs the tarball, installs it into a throwaway project,
// imports every entry point from Node (ESM and require), and type-checks a TypeScript consumer.
// Run with `pnpm test:package` (which builds first). Exits non-zero on the first failure.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const tsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const check = (description, fn) => {
  try {
    fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(error.stdout || error.stderr || error.message);
    process.exitCode = 1;
    throw error;
  }
};

if (!existsSync(join(repoRoot, 'dist', 'index.js'))) {
  console.error('dist/ is missing: run `pnpm build` first (or use `pnpm test:package`)');
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), 'evem-package-check-'));

try {
  let tarball;
  check('npm pack produces a tarball with only the built files', () => {
    const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', workDir], repoRoot));
    tarball = join(workDir, packed.filename);
    const files = packed.files.map(file => file.path);
    for (const required of [
      'package.json',
      'README.md',
      'LICENSE.md',
      'dist/index.js',
      'dist/index.d.ts',
      'dist/websocket/index.js',
      'dist/websocket/index.d.ts',
      'dist/sse/index.js',
      'dist/sse/index.d.ts',
      'dist/sse/server.js',
      'dist/sse/server.d.ts',
      'dist/dom/index.js',
      'dist/dom/index.d.ts'
    ]) {
      if (!files.includes(required)) throw new Error(`missing ${required}; packed: ${files.join(', ')}`);
    }
    const unexpected = files.filter(file => /^(src|tests|demo|docs|scripts)\//.test(file));
    if (unexpected.length > 0) throw new Error(`unexpected files: ${unexpected.join(', ')}`);
  });

  const consumer = join(workDir, 'consumer');
  check('the tarball installs without network access (no runtime dependencies)', () => {
    mkdirSync(consumer);
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
    run('npm', ['install', tarball, '--offline', '--no-audit', '--no-fund', '--ignore-scripts'], consumer);
  });

  check('every entry point imports as an ES module and works', () => {
    const script = `
      import { EvEm, ErrorPolicy, Priority } from "${pkg.name}";
      import { WebSocketHandler, MessageQueue, RequestTimeoutError } from "${pkg.name}/websocket";
      import { SseHandler, SseParser } from "${pkg.name}/sse";
      import { formatSseMessage, SSE_HEADERS } from "${pkg.name}/sse/server";
      import { bridgeToDom, bridgeFromDom } from "${pkg.name}/dom";
      const evem = new EvEm();
      let received;
      evem.subscribe("user.*", data => { received = data; });
      await evem.publish("user.login", { id: 1 });
      if (received?.id !== 1) throw new Error("publish did not reach the subscriber");
      for (const value of [ErrorPolicy, Priority, WebSocketHandler, MessageQueue, RequestTimeoutError, SseHandler, SSE_HEADERS]) {
        if (!value) throw new Error("missing export");
      }
      const parsed = [];
      new SseParser({ onEvent: event => parsed.push(event) }).feed(formatSseMessage({ event: "e", data: { n: 1 } }));
      if (parsed[0]?.data !== '{"n":1}') throw new Error("SSE round trip failed");
      const target = new EventTarget();
      const bridged = [];
      target.addEventListener("user.login", event => bridged.push(event.detail));
      bridgeToDom(evem, "user.*", { target });
      bridgeFromDom(evem, "ui.ready", { target });
      await evem.publish("user.login", { id: 2 });
      if (bridged[0]?.id !== 2) throw new Error("DOM bridge did not dispatch");
    `;
    run(process.execPath, ['--input-type=module', '-e', script], consumer);
  });

  check('every entry point loads with require()', () => {
    const script = `
      const { EvEm } = require("${pkg.name}");
      const { WebSocketHandler } = require("${pkg.name}/websocket");
      const { SseHandler } = require("${pkg.name}/sse");
      const { formatSseMessage } = require("${pkg.name}/sse/server");
      const { bridgeToDom } = require("${pkg.name}/dom");
      for (const value of [EvEm, WebSocketHandler, SseHandler, formatSseMessage, bridgeToDom]) {
        if (typeof value !== "function") throw new Error("missing export");
      }
    `;
    run(process.execPath, ['-e', script], consumer);
  });

  // With Node.js types too: @types/node declares its own fetch, which must still fit the fetch option
  const nodeTypeRoots = [join(repoRoot, 'node_modules', '@types')];
  for (const [moduleResolution, nodeTypes] of [
    ['nodenext', false],
    ['bundler', false],
    ['nodenext', true]
  ]) {
    check(
      `a strict TypeScript consumer type-checks (moduleResolution: ${moduleResolution}${nodeTypes ? ', with Node.js types' : ''})`,
      () => {
        writeFileSync(
          join(consumer, 'index.ts'),
          `
        import { EvEm, ErrorPolicy, type EventRecord, type MemoryLeakOptions } from "${pkg.name}";
        import { WebSocketHandler, type WebSocketHandlerOptions } from "${pkg.name}/websocket";
        import { SseHandler, type SseEvents, type SseHandlerOptions } from "${pkg.name}/sse";
        import { formatSseMessage, type SseMessage } from "${pkg.name}/sse/server";
        import { bridgeToDom, type DomBridgeOptions } from "${pkg.name}/dom";
        const evem = new EvEm();
        const bridgeOptions: DomBridgeOptions = { target: new EventTarget(), rename: name => name.replaceAll(".", ":") };
        const stopBridge: () => void = bridgeToDom(evem, ["server.*"], bridgeOptions);
        evem.subscribe<{ id: number }>("user.login", user => { user.id.toFixed(); });
        const history: EventRecord<{ id: number }>[] = evem.getEventHistory();
        const leakOptions: Partial<MemoryLeakOptions> = { threshold: 20 };
        const options: WebSocketHandlerOptions = { reconnect: true };
        const sseOptions: SseHandlerOptions = { headers: () => ({ Authorization: "Bearer t" }), autoConnect: false };
        const sse = new SseHandler("/events", evem, sseOptions);
        const message: SseMessage = { event: "order.updated", id: 1, data: { id: 7 } };
        const wire: string = formatSseMessage(message);
        const failure: SseEvents["sse.reconnect.failed"] = { attempts: 3 };
        const fetches: SseHandlerOptions[] = [
          { fetch: globalThis.fetch },
          { fetch: async (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init) },
          { fetch: async (url: string) => new Response(url) },
        ];
        export { history, leakOptions, options, sse, wire, failure, fetches, ErrorPolicy, WebSocketHandler, stopBridge };
      `
        );
        writeFileSync(
          join(consumer, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              target: 'es2022',
              module: moduleResolution === 'nodenext' ? 'nodenext' : 'esnext',
              moduleResolution,
              lib: ['es2022', 'dom'],
              ...(nodeTypes ? { types: ['node'], typeRoots: nodeTypeRoots } : { types: [] })
            },
            files: ['index.ts']
          })
        );
        run(process.execPath, [tsc, '-p', 'tsconfig.json'], consumer);
      }
    );
  }
} catch {
  // check() already reported the failure
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (process.exitCode) {
  console.error('Package check failed');
} else {
  console.log('Package check passed');
}
