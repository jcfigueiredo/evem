import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultValues, numberInput, ScenarioSession, type Scenario } from '../../demo/src/engine/session';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScenarioSession', () => {
  it('starts from the default values and the code they render', () => {
    const session = new ScenarioSession(scenario);
    expect(defaultValues(scenario)).toEqual({ greeting: 'hello', loud: false });
    expect(session.code).toContain("await evem.publish('greet', 'hello');");
  });

  it('runs the setup on reset and an action on run, recording both and the code’s own logs', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    expect(session.actions).toEqual([{ id: 'greet', label: 'Greet' }]);
    expect(kinds(session)).toEqual(['subscribe']);

    await session.run('greet');

    expect(kinds(session)).toEqual(['subscribe', 'publish', 'call', 'result', 'log']);
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
    expect(session.trace.entries).toEqual([expect.objectContaining({ kind: 'log', text: 'new' })]);
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
    expect(session.trace.entries).toEqual([expect.objectContaining({ kind: 'error', message: 'no' })]);
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
