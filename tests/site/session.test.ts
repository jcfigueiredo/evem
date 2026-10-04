import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultValues,
  describeChange,
  numberInput,
  optionLabel,
  ScenarioSession,
  type Scenario
} from '../../demo/src/engine/session';

const scenario: Scenario = {
  id: 'greeting',
  group: 'Test',
  title: 'Greeting',
  summary: '',
  docs: '',
  controls: {
    greeting: { kind: 'select', label: 'greeting', options: ['hello', 'hi'], default: 'hello' },
    loud: { kind: 'toggle', label: 'loud', default: false }
  },
  helpers: {
    greet: function greet(name: string) {
      return name;
    }
  },
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    'const evem = new EvEm();',
    "evem.subscribe('greet', greet);",
    '// ▶ Greet',
    "await evem.publish('greet', {{greeting}});",
    "console.log('greeted', {{loud}});"
  ].join('\n'),
  checks: []
};

const kinds = (session: ScenarioSession) => session.trace.entries.map(entry => entry.kind);
const logs = (session: ScenarioSession) =>
  session.trace.entries.flatMap(entry => (entry.kind === 'log' ? [entry.text] : []));

/** A scenario with a fake WebSocket server, whose code connects a WebSocketHandler to it (or to `options`) */
const websocketScenario = (options = '{}'): Scenario => ({
  ...scenario,
  id: 'socket',
  controls: {},
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    'const evem = new EvEm();',
    `const handler = new WebSocketHandler('wss://example.test/ws', evem, ${options});`,
    "evem.subscribe('server.news', function news() {});"
  ].join('\n'),
  websocket: { latency: 10 }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ScenarioSession', () => {
  it('starts from the default values and the code they render', () => {
    const session = new ScenarioSession(scenario);
    expect(defaultValues(scenario)).toEqual({ greeting: 'hello', loud: false });
    expect(session.code).toContain("await evem.publish('greet', 'hello');");
  });

  it('marks where the setup ends, so the timeline can fold it away, and what came after stays after it', async () => {
    const session = new ScenarioSession(scenario);
    expect(session.setupEnd).toBe(0);
    await session.reset();
    expect(session.setupEnd).toBe(1);
    await session.run('greet');
    expect(session.trace.entries.length).toBeGreaterThan(session.setupEnd);
    expect(session.trace.entries[session.setupEnd]).toMatchObject({ kind: 'action' });

    await session.edit('throw new Error("broken setup")');
    expect(session.setupEnd).toBe(0);
  });

  it('runs the setup on reset and an action on run, recording both and the code’s own logs', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    expect(session.actions).toEqual([{ id: 'greet', label: 'Greet' }]);
    expect(kinds(session)).toEqual(['subscribe']);

    await session.run('greet');

    expect(kinds(session)).toEqual(['subscribe', 'action', 'publish', 'call', 'result', 'log']);
    expect(session.trace.entries[1]).toMatchObject({ kind: 'action', label: 'Greet' });
    expect(session.trace.entries.at(-1)).toMatchObject({ kind: 'log', level: 'log', text: 'greeted false' });
  });

  it('renders the code again and restarts when a control changes', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    await session.run('greet');

    await session.setValue('greeting', 'hi');

    expect(session.values.greeting).toBe('hi');
    expect(session.code).toContain("await evem.publish('greet', 'hi');");
    expect(kinds(session)).toEqual(['subscribe']);
  });

  it("runs the reader's edit, keeps it while controls change, and goes back on restoreTemplate", async () => {
    const session = new ScenarioSession(scenario);
    await session.edit(scenario.code.replace('{{greeting}}', "'yo'").replace('{{loud}}', 'true'));
    expect(session.edited).toBe(true);

    await session.setValue('greeting', 'hi');
    expect(session.code).toContain("'yo'");

    await session.restoreTemplate();
    expect(session.edited).toBe(false);
    expect(session.code).toContain("await evem.publish('greet', 'hi');");
  });

  it('records a syntax error in edited code, and a missing action, as errors', async () => {
    const session = new ScenarioSession(scenario);
    await session.edit('const = 1;');
    expect(kinds(session)).toEqual(['error']);

    await session.run('greet');
    expect(session.trace.entries.at(-1)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('No action greet')
    });
  });

  it('records an import the package does not provide as an error, instead of running with it undefined', async () => {
    const session = new ScenarioSession(scenario);
    await session.edit("import { EvEmm } from '@jcfigueiredo/evem';\n// ▶ Greet\n");
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'error', message: '@jcfigueiredo/evem has no export named EvEmm' })
    ]);

    await session.edit("import { EvEm } from '@jcfigueiredo/evem/nope';\n");
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'error', message: "There's no @jcfigueiredo/evem/nope entry point" })
    ]);
  });

  it('records what EvEm itself logs during a run, and puts the console back afterwards', async () => {
    const original = console.error;
    const session = new ScenarioSession({
      ...scenario,
      helpers: {
        greet: function greet() {
          throw new Error('boom');
        }
      }
    });
    await session.reset();
    await session.run('greet');

    expect(session.trace.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'error', subscription: 'greet', message: 'boom' }),
        expect.objectContaining({
          kind: 'log',
          level: 'error',
          text: expect.stringContaining('Error in event handler for "greet"')
        })
      ])
    );
    expect(console.error).toBe(original);
  });

  it('gives the console back on the next reset, even when an earlier action never finished', async () => {
    const original = console.error;
    const session = new ScenarioSession({ ...scenario, code: '// ▶ Hang\nawait new Promise(() => {});' });
    await session.reset();

    void session.run('hang');
    expect(console.error).not.toBe(original);
    await session.reset();

    expect(console.error).toBe(original);
  });

  it('keeps the newest code when an earlier setup finishes after it', async () => {
    let open!: () => void;
    const gate = new Promise<void>(resolve => (open = resolve));
    const session = new ScenarioSession({ ...scenario, helpers: { gate: () => gate } });
    const slow = session.edit('await gate();\n// ▶ Old\nconsole.log("old");');
    await session.edit('// ▶ New\nconsole.log("new");');

    open();
    await slow;
    await session.run('new');

    expect(session.actions).toEqual([{ id: 'new', label: 'New' }]);
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'action', label: 'New' }),
      expect.objectContaining({ kind: 'log', text: 'new' })
    ]);
  });

  it('writes raw select values into the code as code, and text values as strings', () => {
    const session = new ScenarioSession({
      ...scenario,
      controls: {
        greeting: { kind: 'select', label: 'greeting', options: ['[1, 2]', 'null'], default: '[1, 2]', raw: true },
        loud: { kind: 'text', label: 'loud', default: 'very' }
      }
    });
    expect(session.code).toContain("await evem.publish('greet', [1, 2]);");
    expect(session.code).toContain("console.log('greeted', 'very');");
  });

  it('clears the action buttons when the code stops compiling', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    expect(session.actions).toHaveLength(1);

    await session.edit("import WebSocket from 'ws';\n// ▶ Greet\n");

    expect(session.actions).toEqual([]);
  });

  it('clears the action buttons when the setup throws', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    expect(session.actions).toHaveLength(1);

    await session.edit("throw new Error('setup failed');\n// ▶ Greet\n");

    expect(session.actions).toEqual([]);
    expect(session.trace.entries).toEqual([expect.objectContaining({ kind: 'error', message: 'setup failed' })]);
  });

  it("gives the code a console that logs info and debug too, and whose other methods are the page's", async () => {
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
    const session = new ScenarioSession(scenario);

    await session.edit("console.info('hi');\nconsole.debug('there');\nconsole.table([1]);");

    expect(logs(session)).toEqual(['hi', 'there']);
    expect(kinds(session)).toEqual(['log', 'log']);
    expect(table).toHaveBeenCalledWith([1]);
  });

  it('logs short values on one line and long ones indented', async () => {
    const session = new ScenarioSession(scenario);
    await session.edit("console.log({ a: 1 });\nconsole.log({ name: 'x'.repeat(90) });");
    expect(logs(session)).toEqual(['{"a":1}', `{\n  "name": "${'x'.repeat(90)}"\n}`]);
  });

  it('records what the library logs with console.log and console.group during a run, indented by group', async () => {
    const originalLog = console.log;
    const session = new ScenarioSession({
      ...scenario,
      helpers: {
        libraryLog: () => {
          console.group('Details:');
          console.log('inside');
          console.groupEnd();
          console.info('after');
        }
      },
      code: '// ▶ Log\nlibraryLog();'
    });
    await session.reset();
    await session.run('log');

    expect(logs(session)).toEqual(['Details:', '  inside', 'after']);
    expect(console.log).toBe(originalLog);
  });

  it('records an error thrown by an action', async () => {
    const session = new ScenarioSession({ ...scenario, code: '// ▶ Fail\nthrow new Error("no");' });
    await session.reset();
    await session.run('fail');
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'action', label: 'Fail' }),
      expect.objectContaining({ kind: 'error', message: 'no' })
    ]);
  });
});

describe('ScenarioSession with a fake WebSocket server', () => {
  it("connects the code's WebSocketHandler to the scenario's server, and names what the handler registers after it", async () => {
    vi.useFakeTimers();
    const session = new ScenarioSession(websocketScenario());
    await session.reset();
    await vi.advanceTimersByTimeAsync(10);

    expect(session.server?.openConnections).toBe(1);
    const subscribers = session.trace.entries.flatMap(entry =>
      entry.kind === 'subscribe' ? [entry.subscription] : []
    );
    expect(new Set(subscribers)).toEqual(new Set(['WebSocketHandler', 'news']));
    expect(subscribers.at(-1)).toBe('news');
  });

  it('leaves a WebSocketConstructor the code passes alone', async () => {
    vi.useFakeTimers();
    const ownSocket = [
      '{ WebSocketConstructor: class OwnSocket {',
      '  constructor(url) { console.log("own socket for", url); this.readyState = 0; }',
      '  send() {}',
      '  close() {}',
      '} }'
    ].join(' ');
    const session = new ScenarioSession(websocketScenario(ownSocket));
    await session.reset();
    await vi.advanceTimersByTimeAsync(10);

    expect(logs(session)).toEqual(['own socket for wss://example.test/ws']);
    expect(session.server?.openConnections).toBe(0);
  });

  it("names the code's own subscriptions after them again when a handler's constructor throws", async () => {
    const failing = "{ WebSocketConstructor: class Offline { constructor() { throw new Error('offline'); } } }";
    const code = websocketScenario(failing).code.replace(
      /const handler = (new WebSocketHandler\(.*\));/,
      "try { $1; } catch (error) { console.log('no handler:', error.message); }"
    );
    const session = new ScenarioSession({ ...websocketScenario(), code });
    await session.reset();

    expect(logs(session)).toEqual(['no handler: offline']);
    expect(session.trace.entries.filter(entry => entry.kind === 'subscribe')).toMatchObject([{ subscription: 'news' }]);
  });

  it("ends the previous run's connections on reset, and stop() ends the current ones", async () => {
    vi.useFakeTimers();
    const session = new ScenarioSession(websocketScenario('{ reconnect: true, reconnectDelay: 50 }'));
    await session.reset();
    await vi.advanceTimersByTimeAsync(10);
    const first = session.server!;

    await session.reset();
    await vi.advanceTimersByTimeAsync(200);
    expect(first.openConnections).toBe(0);
    expect(session.server).not.toBe(first);
    expect(session.server?.openConnections).toBe(1);

    const second = session.server!;
    session.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(second.openConnections).toBe(0);
  });
});

/** A scenario with a fake SSE server whose code reads from it with an SseHandler (with `options`) */
const sseScenario = (options = '{ reconnect: false }'): Scenario => ({
  ...scenario,
  id: 'stream',
  controls: {},
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { SseHandler } from '@jcfigueiredo/evem/sse';",
    'const evem = new EvEm();',
    `const sse = new SseHandler('/events', evem, ${options});`,
    "evem.subscribe('server.hello', function hello(data) { console.log('hello', data); });"
  ].join('\n'),
  sse: {
    latency: 10,
    onOpen: stream => stream.send({ event: 'hello', data: 1 }),
    local: { command: 'python3 server.py' }
  }
});

describe('ScenarioSession with a fake SSE server', () => {
  // SseHandler resolves a relative URL against the page's address, as it does in the browser
  const page = () => vi.stubGlobal('location', { href: 'http://localhost:5199/playground/' });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives the code's SseHandler the scenario's server, and stop() closes its stream", async () => {
    vi.useFakeTimers();
    page();
    const session = new ScenarioSession(sseScenario());
    await session.reset();
    await vi.advanceTimersByTimeAsync(30);

    expect(logs(session)).toEqual(['hello 1']);
    expect(session.server?.openConnections).toBe(1);
    session.stop();
    await vi.advanceTimersByTimeAsync(30);
    expect(session.server?.openConnections).toBe(0);
  });

  it("tells the states of the code's handlers: reconnecting after a drop, or stopped for good", async () => {
    vi.useFakeTimers();
    page();
    const reconnecting = new ScenarioSession(sseScenario('{ reconnectDelay: 1000 }'));
    await reconnecting.reset();
    await vi.advanceTimersByTimeAsync(30);
    expect(reconnecting.connectionStates()).toEqual(['connected']);
    reconnecting.server?.run('drop');
    await vi.advanceTimersByTimeAsync(10);
    expect(reconnecting.connectionStates()).toEqual(['reconnecting']);

    const stopped = new ScenarioSession(sseScenario());
    await stopped.reset();
    await vi.advanceTimersByTimeAsync(30);
    stopped.server?.run('drop');
    await vi.advanceTimersByTimeAsync(10);
    expect(stopped.connectionStates()).toEqual(['disconnected']);
    reconnecting.stop();
  });

  it('leaves a fetch the code passes alone', async () => {
    vi.useFakeTimers();
    page();
    const own =
      "{ reconnect: false, fetch: async url => { console.log('own fetch for', url); throw new Error('offline'); } }";
    const session = new ScenarioSession(sseScenario(own));
    await session.reset();
    await vi.advanceTimersByTimeAsync(30);

    expect(logs(session)).toEqual(['own fetch for /events']);
    expect(session.server?.wire).toEqual([]);
  });

  it("switches to the local server: the page's own fetch, with the same wire log", async () => {
    page();
    const encoder = new TextEncoder();
    const pageFetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start: controller => {
          controller.enqueue(encoder.encode('event: hello\ndata: 2\n\n'));
          controller.close();
        }
      });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', pageFetch);
    const session = new ScenarioSession(sseScenario());
    await session.useLocalServer(true);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(pageFetch).toHaveBeenCalledWith('/events', expect.anything());
    expect(logs(session)).toEqual(['hello 2']);
    expect(session.server?.wire.map(entry => entry.text)).toEqual([
      'GET /events',
      'connection 1 answered 200 (text/event-stream)',
      'event: hello\ndata: 2\n\n',
      'connection 1 ended by the server'
    ]);

    await session.useLocalServer(false);
    expect(session.localServer).toBe(false);
    expect(() => session.server?.run('end')).not.toThrow();
  });
});

describe('describeChange', () => {
  it('names a control and its new value, as the timeline marks where the scenario started over', () => {
    expect(describeChange({ kind: 'number', label: 'throttleTime (ms)', min: 0, max: 1000, default: 300 }, 400)).toBe(
      'throttleTime (ms) → 400'
    );
    expect(describeChange({ kind: 'toggle', label: 'backoff', default: true }, false)).toBe('backoff → off');
    expect(describeChange({ kind: 'select', label: 'prefix', options: ['', 'server'], default: 'server' }, '')).toBe(
      "prefix → '' (empty)"
    );
  });
});

describe('optionLabel', () => {
  it("shows a select's options as they are, and the empty string as something to see", () => {
    expect(optionLabel('server')).toBe('server');
    expect(optionLabel('ErrorPolicy.THROW')).toBe('ErrorPolicy.THROW');
    expect(optionLabel(500)).toBe('500');
    expect(optionLabel('')).toBe("'' (empty)");
  });
});

describe('numberInput', () => {
  const control = { min: 0, max: 100 };

  it('keeps a number between the min and the max', () => {
    expect(numberInput('42', control, 5)).toBe(42);
    expect(numberInput('-3', control, 5)).toBe(0);
    expect(numberInput('250', control, 5)).toBe(100);
  });

  it('keeps the previous value for an empty input or one that is not a number', () => {
    expect(numberInput('', control, 5)).toBe(5);
    expect(numberInput('  ', control, 5)).toBe(5);
    expect(numberInput('abc', control, 5)).toBe(5);
  });
});
