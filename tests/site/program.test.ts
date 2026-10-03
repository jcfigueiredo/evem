import { describe, expect, it } from 'vitest';
import { compileProgram, renderCode, slug, splitActions, toLiteral } from '../../demo/src/engine/program';

describe('toLiteral', () => {
  it('writes strings in single quotes, escaped, and numbers and booleans as they are', () => {
    expect(toLiteral('high')).toBe("'high'");
    expect(toLiteral("it's a \\ path")).toBe("'it\\'s a \\\\ path'");
    expect(toLiteral(-10)).toBe('-10');
    expect(toLiteral(true)).toBe('true');
  });
});

describe('renderCode', () => {
  it('replaces each {{name}} with that control value as a literal', () => {
    expect(
      renderCode("subscribe('a', f, { priority: {{priority}}, once: {{once}} })", { priority: 'high', once: false })
    ).toBe("subscribe('a', f, { priority: 'high', once: false })");
  });

  it('throws for a placeholder that has no control', () => {
    expect(() => renderCode('{{missing}}', {})).toThrow('No control named missing for {{missing}}');
  });
});

describe('slug', () => {
  it('makes lowercase words joined by dashes', () => {
    expect(slug('Publish order.created!')).toBe('publish-order-created');
  });
});

describe('splitActions', () => {
  it('splits the setup from the action blocks that start at // ▶ lines', () => {
    const code = ['const a = 1;', '// ▶ First thing', 'one();', '// ▶ Second thing', 'two();', 'three();'].join('\n');
    expect(splitActions(code)).toEqual({
      setup: 'const a = 1;',
      actions: [
        { id: 'first-thing', label: 'First thing', code: 'one();' },
        { id: 'second-thing', label: 'Second thing', code: 'two();\nthree();' }
      ]
    });
  });
});

describe('compileProgram', () => {
  it('resolves package imports and returns the actions as functions that share the setup', async () => {
    const code = [
      "import { EvEm as Emitter, type EventRecord } from '@jcfigueiredo/evem';",
      'let count = 0;',
      'const name = Emitter.name;',
      '// ▶ Count',
      'count++;',
      'return `${name} ${count}`;'
    ].join('\n');
    const { body, actions } = compileProgram(code);
    expect(actions).toEqual([{ id: 'count', label: 'Count' }]);

    const run = new Function('__modules', `return (async () => {\n${body}\n})();`);
    const program = await run({ '@jcfigueiredo/evem': { EvEm: class Real {} } });
    expect(await program.count()).toBe('Real 1');
    expect(await program.count()).toBe('Real 2');
  });

  it('lists the names the code imports from each entry point, so they can be checked', () => {
    const code = [
      "import { EvEm as Emitter, type EventRecord, toServerEventName } from '@jcfigueiredo/evem';",
      "import { SseHandler } from '@jcfigueiredo/evem/sse';"
    ].join('\n');
    expect(compileProgram(code).imports).toEqual([
      { entryPoint: '@jcfigueiredo/evem', names: ['EvEm', 'toServerEventName'] },
      { entryPoint: '@jcfigueiredo/evem/sse', names: ['SseHandler'] }
    ]);
  });

  it('reports any other import', () => {
    expect(() => compileProgram("import WebSocket from 'ws';")).toThrow(
      'Only imports from @jcfigueiredo/evem are supported here'
    );
  });
});
