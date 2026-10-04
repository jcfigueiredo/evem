import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { renderCode } from '../../demo/src/engine/program';
import { defaultValues, rawControls, ScenarioSession, type Scenario } from '../../demo/src/engine/session';
import { scenarioPath } from '../../demo/src/routing';
import { scenarios } from '../../demo/src/scenarios';
import { typeCheck } from '../docs/typeCheck';

const scratch = mkdtempSync(join(tmpdir(), 'evem-scenarios-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The scenarios run in a page, whose address resolves relative URLs (SseHandler checks that it can) */
const PAGE = { href: 'http://localhost:5199/playground/' };

/** The scenario's code with every value of every control, one control at a time (the others at their defaults) */
function variants(scenario: Scenario): string[] {
  const defaults = defaultValues(scenario);
  const raw = rawControls(scenario);
  const codes = [renderCode(scenario.code, defaults, raw)];
  for (const [name, control] of Object.entries(scenario.controls)) {
    const values =
      control.kind === 'select'
        ? control.options
        : control.kind === 'toggle'
          ? [true, false]
          : control.kind === 'number'
            ? [control.min, control.max]
            : (control.suggestions ?? []);
    for (const value of values) codes.push(renderCode(scenario.code, { ...defaults, [name]: value }, raw));
  }
  return codes;
}

/**
 * Run an action, or a command to the scenario's server, `server:<command> <argument>` (what the Server tab's
 * controls do: `server:drop`, `server:send <text>`, …)
 */
async function step(session: ScenarioSession, action: string): Promise<void> {
  if (!action.startsWith('server:')) return session.run(action);
  const server = session.server;
  if (!server) throw new Error(`${action}: the scenario has no server`);
  const space = action.indexOf(' ');
  const command = action.slice('server:'.length, space === -1 ? undefined : space);
  server.run(command, space === -1 ? '' : action.slice(space + 1));
}

/** Whether a check's step is an action of the scenario's code (not a server command or a wait) */
const isAction = (step: string) => !step.startsWith('server:') && !step.startsWith('wait:');

/** In order: each expected part appears in a later line than the one before */
function expectInOrder(lines: string[], expected: string[] | undefined, what: string): void {
  let from = 0;
  for (const part of expected ?? []) {
    const index = lines.findIndex((line, position) => position >= from && line.includes(part));
    expect(index, `${what} containing ${JSON.stringify(part)}, in order, in ${JSON.stringify(lines)}`).not.toBe(-1);
    from = index + 1;
  }
}

/**
 * Finish a session step under fake timers. By default every timer it starts fires (delays, timeouts, slow callbacks);
 * a scenario whose server never runs out of timers (a stream of ticks) is `bounded`: time passes in small steps until
 * the step is done, and then only as checks ask (`wait`)
 */
async function settle(step: Promise<void>, bounded = false): Promise<void> {
  let done = false;
  void step.finally(() => (done = true));
  for (let turn = 0; !done && turn < 100; turn++) {
    if (bounded) await vi.advanceTimersByTimeAsync(50);
    else await vi.runAllTimersAsync();
  }
  await step;
}

/**
 * Run a check's step and let it finish: `wait:<ms>` lets exactly that much time pass; anything else is settled.
 * A wait doesn't go through `settle`, whose bounded steps of 50 ms would add to it.
 */
async function runStep(session: ScenarioSession, action: string, bounded: boolean): Promise<void> {
  if (action.startsWith('wait:')) await vi.advanceTimersByTimeAsync(Number(action.slice('wait:'.length)));
  else await settle(step(session, action), bounded);
}

describe('the check runner', () => {
  it('lets exactly the time a wait: step asks for pass, bounded or not', async () => {
    vi.useFakeTimers();
    const session = new ScenarioSession(scenarios[0]!);
    for (const bounded of [true, false]) {
      const start = Date.now();
      await runStep(session, 'wait:120', bounded);
      expect(Date.now() - start, bounded ? 'bounded' : 'unbounded').toBe(120);
    }
    vi.useRealTimers();
  });
});

describe('the scenario list', () => {
  it('has unique ids and addresses', () => {
    expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(scenarios.length);
    expect(new Set(scenarios.map(scenarioPath)).size).toBe(scenarios.length);
  });

  it('explains every control in a sentence short enough to read at a glance', () => {
    for (const scenario of scenarios) {
      for (const [name, control] of Object.entries(scenario.controls)) {
        const where = `${scenario.id}: ${name}`;
        expect(control.hint, where).toMatch(/^\S.*[.)]$/);
        expect(control.hint!.length, where).toBeLessThanOrEqual(110);
      }
    }
  });

  it('keeps each group together, so the menu shows it once', () => {
    const groups = scenarios.map(scenario => scenario.group);
    const runs = groups.filter((group, index) => group !== groups[index - 1]);
    expect(runs).toEqual([...new Set(groups)]);
  });
});

describe.each(scenarios.map(scenario => [scenario.id, scenario] as const))('scenario %s', (_id, scenario) => {
  it('has select defaults among their options, and checks only for actions it has', async () => {
    for (const control of Object.values(scenario.controls)) {
      if (control.kind === 'select') expect(control.options).toContain(control.default);
    }
    vi.stubGlobal('location', PAGE);
    const session = new ScenarioSession(scenario);
    await session.reset();
    // Its connections end here (with real timers, a server's ticks would keep running)
    session.stop();
    const actions = session.actions.map(action => action.id);
    expect(scenario.checks.length).toBeGreaterThan(0);
    for (const check of scenario.checks) {
      for (const action of [...(check.before ?? []), check.action]) {
        if (isAction(action)) expect(actions).toContain(action);
      }
    }
  });

  it('type-checks against the package API with every control value', () => {
    const prelude = join(scratch, `${scenario.id}.d.ts`);
    const helpers = Object.keys(scenario.helpers).map(name => `  const ${name}: (...args: any[]) => any;`);
    writeFileSync(prelude, `declare global {\n${helpers.join('\n')}\n}\nexport {};\n`);
    const files = variants(scenario).map((code, index) => ({ path: `__scenarios__/${scenario.id}_${index}.ts`, code }));
    // Scenario code is JavaScript: its own functions' parameters have no types
    const problems = typeCheck(files, [prelude], { noImplicitAny: false }).map(
      d => `${d.path}:${d.line}: TS${d.code} ${d.message}`
    );
    expect(problems).toEqual([]);
  }, 60_000);

  it.each(scenario.checks.map((check, index) => [index + 1, check] as const))(
    'check %i: the action does what the scenario says',
    async (_index, check) => {
      vi.useFakeTimers();
      vi.stubGlobal('location', PAGE);
      const bounded = scenario.sse !== undefined;
      // No jitter in reconnect delays (0.5 is a factor of exactly 1), so the checks can count on them
      if (bounded) vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const session = new ScenarioSession(scenario);
      Object.assign(session.values, check.values ?? {});
      await settle(session.restoreTemplate(), bounded);
      for (const action of check.before ?? []) await runStep(session, action, bounded);
      const before = session.trace.entries.length;
      const wireBefore = session.server?.wire.length ?? 0;

      await runStep(session, check.action, bounded);
      if (check.wait) await vi.advanceTimersByTimeAsync(check.wait);

      const entries = session.trace.entries.slice(before);
      // Subscribers may throw on purpose; the code itself, the setup and the actions must not
      expect(entries.filter(entry => entry.kind === 'error' && !entry.subscription)).toEqual([]);
      expect(entries.flatMap(entry => (entry.kind === 'call' ? [entry.subscription] : []))).toEqual(check.calls);
      if (check.result !== undefined) {
        expect(entries.filter(entry => entry.kind === 'result').at(-1)).toMatchObject({ result: check.result });
      }
      if (check.rejects !== undefined) {
        expect(entries.filter(entry => entry.kind === 'rejected').at(-1)).toMatchObject({
          error: expect.stringContaining(check.rejects)
        });
      }
      if (check.skipped !== undefined) {
        expect(
          entries.flatMap(entry => (entry.kind === 'skip' ? [`${entry.subscription}: ${entry.reason}`] : []))
        ).toEqual(check.skipped);
      }
      const logs = entries.flatMap(entry => (entry.kind === 'log' ? [entry.text] : []));
      expectInOrder(logs, check.logs, 'a log');
      const wire = (session.server?.wire ?? []).slice(wireBefore).map(entry => `${entry.direction}: ${entry.text}`);
      expectInOrder(wire, check.wire, 'a wire line');
    }
  );
});
