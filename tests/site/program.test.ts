import { describe, expect, it } from 'vitest';
import { actionLabel, compileProgram, renderCode, slug, splitActions, toLiteral } from '../../demo/src/engine/program';
import { defaultValues, rawControls } from '../../demo/src/engine/session';
import { scenarios } from '../../demo/src/scenarios';

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

  it('writes the values of raw controls as they are: they are code', () => {
    expect(
      renderCode(
        'publish(e, d, { errorPolicy: {{policy}} }); log({{name}})',
        { policy: 'ErrorPolicy.THROW', name: 'ada' },
        new Set(['policy'])
      )
    ).toBe("publish(e, d, { errorPolicy: ErrorPolicy.THROW }); log('ada')");
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

describe('actionLabel', () => {
  it("reads an action's label from its `// ▶ Label` line, indented or not, and nothing from other lines", () => {
    expect(actionLabel('// ▶ Show the last event id')).toBe('Show the last event id');
    expect(actionLabel('   // ▶  Type "hello world"  ')).toBe('Type "hello world"');
    expect(actionLabel('// Show the last event id')).toBeUndefined();
    expect(actionLabel("console.log('// ▶ not a marker')")).toBeUndefined();
  });

  it("finds exactly the actions compileProgram finds, in every scenario: the code's ▶ buttons and its action buttons agree", () => {
    for (const scenario of scenarios) {
      const code = renderCode(scenario.code, defaultValues(scenario), rawControls(scenario));
      const labels = code.split('\n').flatMap(line => actionLabel(line) ?? []);
      expect(labels, scenario.id).toEqual(compileProgram(code).actions.map(action => action.label));
    }
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
