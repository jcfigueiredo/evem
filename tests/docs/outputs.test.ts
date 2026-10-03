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
    const code =
      "import { EvEm as Emitter, type CancelableEvent } from '@jcfigueiredo/evem';\nconst e = new Emitter();";
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
    const run = await runSample(
      "console.log('a', { b: 1 }); console.error('c'); console.warn('d');",
      'doc.md:1',
      MODULES
    );
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

  it('fails with the location when the sample keeps scheduling timers and never finishes', async () => {
    await expect(
      runSample('setInterval(() => {}, 1000);\nawait new Promise(() => {});', 'README.md:11', MODULES)
    ).rejects.toThrow('README.md:11: the sample never finished: it keeps scheduling timers');
    expect(vi.isFakeTimers()).toBe(false);
    expect(vi.isMockFunction(console.log)).toBe(false);
  }, 15_000);

  it('fails with the location when the sample keeps scheduling timers', async () => {
    await expect(runSample("setInterval(() => console.log('tick'), 1000);", 'README.md:9', MODULES)).rejects.toThrow(
      'README.md:9: Aborting after running'
    );
  }, 30_000);
});
