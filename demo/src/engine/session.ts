import type { EvEm } from '@jcfigueiredo/evem';
import * as core from '@jcfigueiredo/evem';
import * as sse from '@jcfigueiredo/evem/sse';
import * as sseServer from '@jcfigueiredo/evem/sse/server';
import * as websocket from '@jcfigueiredo/evem/websocket';
import { compileProgram, renderCode, type Action, type ControlValue, type PackageImport } from './program';
import { Trace } from './trace';
import { createTracedEvEm } from './tracedEvEm';

export type Control =
  | { kind: 'select'; label: string; options: readonly ControlValue[]; default: ControlValue }
  | { kind: 'number'; label: string; min: number; max: number; step?: number; default: number }
  | { kind: 'toggle'; label: string; default: boolean };

/** A hand-checked expectation for one action, used by the scenario tests */
export interface ScenarioCheck {
  /** Control values for this check; the defaults otherwise */
  values?: Record<string, ControlValue>;
  action: string;
  /** Subscription names in the order their callbacks ran during the action */
  calls: string[];
  /** What the action's last publish resolved to */
  result?: boolean;
}

export interface Scenario {
  id: string;
  group: string;
  title: string;
  summary: string;
  /** Link to the feature's documentation */
  docs: string;
  controls: Record<string, Control>;
  /** Functions the code uses by name, like the reader's own code would (their names show in the timeline) */
  helpers: Record<string, (...args: any[]) => unknown>;
  /** The code, with `{{control}}` placeholders and `// ▶ Label` lines that start action blocks */
  code: string;
  checks: ScenarioCheck[];
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...parameters: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** The page's own console methods, which every run that replaces them puts back */
const pageConsole = { warn: console.warn, error: console.error };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The default value of every control */
export function defaultValues(scenario: Scenario): Record<string, ControlValue> {
  return Object.fromEntries(Object.entries(scenario.controls).map(([name, control]) => [name, control.default]));
}

/**
 * One scenario in the workbench: its control values, the code they render to (or the reader's edit), and a
 * running program with its trace. Every reset starts from a fresh EvEm and runs the setup again.
 */
export class ScenarioSession {
  readonly values: Record<string, ControlValue>;
  code: string;
  edited = false;
  actions: Action[] = [];
  trace: Trace;
  private program: Record<string, () => Promise<void>> | undefined;

  constructor(
    readonly scenario: Scenario,
    private readonly bus?: EvEm
  ) {
    this.values = defaultValues(scenario);
    this.code = renderCode(scenario.code, this.values);
    this.trace = new Trace(bus);
  }

  /** Change a control: the code is rendered again (unless it's being edited) and the scenario restarts */
  setValue(name: string, value: ControlValue): Promise<void> {
    this.values[name] = value;
    if (!this.edited) {
      this.code = renderCode(this.scenario.code, this.values);
    }
    return this.reset();
  }

  /** Run the reader's own version of the code */
  edit(code: string): Promise<void> {
    this.edited = true;
    this.code = code;
    return this.reset();
  }

  /** Go back to the code the controls render */
  restoreTemplate(): Promise<void> {
    this.edited = false;
    this.code = renderCode(this.scenario.code, this.values);
    return this.reset();
  }

  /**
   * Start over: a new trace, a fresh EvEm, and the setup code run again. A setup that finishes after a newer reset
   * started (a slow one) leaves the newer program and trace alone.
   */
  async reset(): Promise<void> {
    const trace = new Trace(this.bus);
    this.trace = trace;
    this.program = undefined;
    try {
      const { body, actions, imports } = compileProgram(this.code);
      this.actions = actions;
      const modules: Record<string, object> = {
        '@jcfigueiredo/evem': { ...core, EvEm: createTracedEvEm(trace, this.helperNames()) },
        '@jcfigueiredo/evem/websocket': websocket,
        '@jcfigueiredo/evem/sse': sse,
        '@jcfigueiredo/evem/sse/server': sseServer
      };
      checkImports(imports, modules);
      const helperNames = Object.keys(this.scenario.helpers);
      const run = new AsyncFunction('__modules', 'console', ...helperNames, body);
      const helpers = helperNames.map(name => this.scenario.helpers[name]);
      const program = await this.capturingLogs(trace, () => run(modules, this.consoleForCode(trace), ...helpers));
      if (this.trace === trace) this.program = program as Record<string, () => Promise<void>>;
    } catch (error) {
      trace.record({ kind: 'error', message: messageOf(error) });
    }
  }

  /** Run one action block; its errors go to the trace */
  async run(actionId: string): Promise<void> {
    const trace = this.trace;
    const action = this.program?.[actionId];
    if (!action) {
      trace.record({ kind: 'error', message: `No action ${actionId} (the setup failed, or the code changed)` });
      return;
    }
    try {
      await this.capturingLogs(trace, action);
    } catch (error) {
      trace.record({ kind: 'error', message: messageOf(error) });
    }
  }

  /** The scenario's names for its helpers, which a production build's minifier would otherwise rename */
  private helperNames(): Map<Function, string> {
    return new Map(Object.entries(this.scenario.helpers).map(([name, helper]) => [helper as Function, name]));
  }

  /** The `console` the scenario's code sees: what it logs goes to `trace` */
  private consoleForCode(trace: Trace): Pick<Console, 'log' | 'warn' | 'error'> {
    const record =
      (level: 'log' | 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: args.map(formatArgument).join(' ') });
    return { log: record('log'), warn: record('warn'), error: record('error') };
  }

  /** Run `work`, recording what EvEm itself logs meanwhile (e.g. "Error in event handler …") in `trace` */
  private async capturingLogs<V>(trace: Trace, work: () => Promise<V>): Promise<V> {
    const record =
      (level: 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: args.map(formatArgument).join(' ') });
    const capture = { warn: record('warn'), error: record('error') };
    console.warn = capture.warn;
    console.error = capture.error;
    try {
      return await work();
    } finally {
      // Undo only this capture, back to the page's console: a newer run that replaced it undoes its own, so a run
      // that never finishes (or finishes late) can't keep the console
      if (console.warn === capture.warn) console.warn = pageConsole.warn;
      if (console.error === capture.error) console.error = pageConsole.error;
    }
  }
}

/** Report an import the playground can't provide, as TypeScript would, instead of running with it undefined */
function checkImports(imports: readonly PackageImport[], modules: Readonly<Record<string, object>>): void {
  for (const { entryPoint, names } of imports) {
    const module = modules[entryPoint];
    if (!module) throw new Error(`There's no ${entryPoint} entry point`);
    for (const name of names) {
      if (!(name in module)) throw new Error(`${entryPoint} has no export named ${name}`);
    }
  }
}

/** A logged value as text: errors by their message, objects as JSON */
function formatArgument(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
