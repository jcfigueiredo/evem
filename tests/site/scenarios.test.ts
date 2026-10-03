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
});

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

/** Finish a session step under fake timers, firing every timer it starts (delays, timeouts, slow callbacks) */
async function settle(step: Promise<void>): Promise<void> {
  let done = false;
  void step.finally(() => (done = true));
  for (let turn = 0; !done && turn < 100; turn++) await vi.runAllTimersAsync();
  await step;
}

describe('the scenario list', () => {
  it('has unique ids and addresses', () => {
    expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(scenarios.length);
    expect(new Set(scenarios.map(scenarioPath)).size).toBe(scenarios.length);
  });

  it('keeps each group together, so the sidebar shows it once', () => {
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
    const session = new ScenarioSession(scenario);
    await session.reset();
    const actions = session.actions.map(action => action.id);
    expect(scenario.checks.length).toBeGreaterThan(0);
    for (const check of scenario.checks) {
      for (const action of [...(check.before ?? []), check.action]) expect(actions).toContain(action);
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
      const session = new ScenarioSession(scenario);
      Object.assign(session.values, check.values ?? {});
      await settle(session.restoreTemplate());
      for (const action of check.before ?? []) await settle(session.run(action));
      const before = session.trace.entries.length;

      await settle(session.run(check.action));

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
      let from = 0;
      for (const expected of check.logs ?? []) {
        const index = logs.findIndex((text, position) => position >= from && text.includes(expected));
        expect(index, `a log containing ${JSON.stringify(expected)}, in order, in ${JSON.stringify(logs)}`).not.toBe(
          -1
        );
        from = index + 1;
      }
    }
  );
});
