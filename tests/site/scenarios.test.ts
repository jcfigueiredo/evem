import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { renderCode } from '../../demo/src/engine/program';
import { defaultValues, ScenarioSession, type Scenario } from '../../demo/src/engine/session';
import { scenarioPath } from '../../demo/src/routing';
import { scenarios } from '../../demo/src/scenarios';
import { typeCheck } from '../docs/typeCheck';

const scratch = mkdtempSync(join(tmpdir(), 'evem-scenarios-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The scenario's code with every value of every control, one control at a time (the others at their defaults) */
function variants(scenario: Scenario): string[] {
  const defaults = defaultValues(scenario);
  const codes = [renderCode(scenario.code, defaults)];
  for (const [name, control] of Object.entries(scenario.controls)) {
    const values =
      control.kind === 'select'
        ? control.options
        : control.kind === 'toggle'
          ? [true, false]
          : [control.min, control.max];
    for (const value of values) codes.push(renderCode(scenario.code, { ...defaults, [name]: value }));
  }
  return codes;
}

describe('the scenario list', () => {
  it('has unique ids and addresses', () => {
    expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(scenarios.length);
    expect(new Set(scenarios.map(scenarioPath)).size).toBe(scenarios.length);
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
    for (const check of scenario.checks) expect(actions).toContain(check.action);
  });

  it('type-checks against the package API with every control value', () => {
    const prelude = join(scratch, `${scenario.id}.d.ts`);
    const helpers = Object.keys(scenario.helpers).map(name => `  const ${name}: (...args: any[]) => any;`);
    writeFileSync(prelude, `declare global {\n${helpers.join('\n')}\n}\nexport {};\n`);
    const files = variants(scenario).map((code, index) => ({ path: `__scenarios__/${scenario.id}_${index}.ts`, code }));
    const problems = typeCheck(files, [prelude]).map(d => `${d.path}:${d.line}: TS${d.code} ${d.message}`);
    expect(problems).toEqual([]);
  }, 60_000);

  it.each(scenario.checks.map((check, index) => [index + 1, check] as const))(
    'check %i: the action calls its subscribers in the expected order',
    async (_index, check) => {
      const session = new ScenarioSession(scenario);
      for (const [name, value] of Object.entries(check.values ?? {})) {
        session.values[name] = value;
      }
      await session.restoreTemplate();
      const before = session.trace.entries.length;

      await session.run(check.action);

      const entries = session.trace.entries.slice(before);
      expect(entries.filter(entry => entry.kind === 'error')).toEqual([]);
      expect(entries.flatMap(entry => (entry.kind === 'call' ? [entry.subscription] : []))).toEqual(check.calls);
      if (check.result !== undefined) {
        expect(entries.filter(entry => entry.kind === 'result').at(-1)).toMatchObject({ result: check.result });
      }
    }
  );
});
