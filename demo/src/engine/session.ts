import type { EvEm } from '@jcfigueiredo/evem';
import * as core from '@jcfigueiredo/evem';
import * as sse from '@jcfigueiredo/evem/sse';
import * as sseServer from '@jcfigueiredo/evem/sse/server';
import * as websocket from '@jcfigueiredo/evem/websocket';
import { FakeWebSocketServer, type FakeWebSocketBehavior } from '../fakes/webSocketServer';
import { compileProgram, renderCode, type Action, type ControlValue, type PackageImport } from './program';
import { Trace } from './trace';
import { createTracedEvEm } from './tracedEvEm';

export type Control =
  /** `raw`: the options are code (`ErrorPolicy.THROW`), written into the code as they are, not as string literals */
  | { kind: 'select'; label: string; options: readonly ControlValue[]; default: ControlValue; raw?: boolean }
  | { kind: 'number'; label: string; min: number; max: number; step?: number; default: number }
  | { kind: 'toggle'; label: string; default: boolean }
  /** Free text; `suggestions` are offered in the input (and type-checked by the scenario tests) */
  | { kind: 'text'; label: string; default: string; suggestions?: readonly string[] };

/** A hand-checked expectation for one action, used by the scenario tests */
export interface ScenarioCheck {
  /** Control values for this check; the defaults otherwise */
  values?: Record<string, ControlValue>;
  /** Actions to run first (their trace isn't checked) */
  before?: string[];
  action: string;
  /** Subscription names in the order their callbacks ran during the action */
  calls: string[];
  /** What the action's last publish resolved to */
  result?: boolean;
  /** Part of the error the action's last publish rejected with */
  rejects?: string;
  /** Parts of what the action logged, in order (the code's console, and EvEm's own warnings and errors) */
  logs?: string[];
  /** `name: reason` for each subscription the action's publishes skipped, in order */
  skipped?: string[];
  /** Parts of the fake server's wire log during the action, in order (`client: …`, `server: …`, `note: …`) */
  wire?: string[];
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
  /** Record, for every publish, whether each subscription's pattern matched and why (the Wildcards scenario) */
  explainMatches?: boolean;
  /** Show the latest action over time: a lane for its publishes and one per subscriber (flow control) */
  lanes?: boolean;
  /**
   * A fake WebSocket server for the scenario: how it behaves, and a sample frame for the server pane's send box. The
   * code's `WebSocketHandler` connects to it unless the code passes its own `WebSocketConstructor`.
   */
  websocket?: FakeWebSocketBehavior & { sample?: string };
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...parameters: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** The page's own console methods, which every run that replaces them puts back */
const CAPTURED = ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const;
type Captured = (typeof CAPTURED)[number];
const pageConsole: Pick<Console, Captured> = Object.fromEntries(
  CAPTURED.map(method => [method, console[method]])
) as Pick<Console, Captured>;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * What a number control's input means: the number, kept between the control's min and max, or `previous` when the
 * input is empty or not a number
 */
export function numberInput(text: string, control: { min: number; max: number }, previous: number): number {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return previous;
  return Math.min(control.max, Math.max(control.min, value));
}

/** A select option's label: the option as it is, but the empty string as `'' (empty)`, which a blank label would hide */
export function optionLabel(option: ControlValue): string {
  return option === '' ? "'' (empty)" : String(option);
}

/** The controls whose values are code, written as they are */
export function rawControls(scenario: Scenario): Set<string> {
  return new Set(
    Object.entries(scenario.controls).flatMap(([name, control]) =>
      control.kind === 'select' && control.raw ? [name] : []
    )
  );
}

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
  /** The scenario's fake WebSocket server, new at every reset (scenarios with `websocket`) */
  server: FakeWebSocketServer | undefined;
  private program: Record<string, () => Promise<void>> | undefined;
  /** The WebSocket handlers the code created, disconnected when the scenario starts over */
  private handlers: websocket.WebSocketHandler[] = [];

  constructor(
    readonly scenario: Scenario,
    private readonly bus?: EvEm
  ) {
    this.values = defaultValues(scenario);
    this.code = renderCode(scenario.code, this.values, rawControls(scenario));
    this.trace = new Trace(bus);
  }

  /** Change a control: the code is rendered again (unless it's being edited) and the scenario restarts */
  setValue(name: string, value: ControlValue): Promise<void> {
    this.values[name] = value;
    if (!this.edited) {
      this.code = renderCode(this.scenario.code, this.values, rawControls(this.scenario));
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
    this.code = renderCode(this.scenario.code, this.values, rawControls(this.scenario));
    return this.reset();
  }

  /** End the run's connections: the code's WebSocket handlers disconnect, and the fake server closes */
  stop(): void {
    for (const handler of this.handlers.splice(0)) void handler.disconnect().catch(() => undefined);
    this.server?.close();
  }

  /**
   * Start over: a new trace, a fresh EvEm, and the setup code run again (and a new fake server, for a scenario with
   * one). A setup that finishes after a newer reset started (a slow one) leaves the newer program and trace alone.
   */
  async reset(): Promise<void> {
    const trace = new Trace(this.bus);
    this.trace = trace;
    this.program = undefined;
    this.stop();
    this.server = this.scenario.websocket
      ? new FakeWebSocketServer(
          this.scenario.websocket,
          () => trace.now(),
          entry => void this.bus?.publish('wire.entry', entry)
        )
      : undefined;
    this.actions = [];
    try {
      const { body, actions, imports } = compileProgram(this.code);
      this.actions = actions;
      const modules: Record<string, object> = {
        '@jcfigueiredo/evem': {
          ...core,
          EvEm: createTracedEvEm(trace, this.helperNames(), { explainMatches: this.scenario.explainMatches })
        },
        '@jcfigueiredo/evem/websocket': { ...websocket, WebSocketHandler: this.playgroundWebSocketHandler(trace) },
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
      // No program, so no action can run: no buttons (unless a newer reset has taken over)
      if (this.trace === trace) this.actions = [];
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
    trace.record({ kind: 'action', label: this.actions.find(known => known.id === actionId)?.label ?? actionId });
    try {
      await this.capturingLogs(trace, action);
    } catch (error) {
      trace.record({ kind: 'error', message: messageOf(error) });
    }
  }

  /**
   * The code's WebSocketHandler: the library's, connecting to the scenario's fake server unless the code passes its own
   * WebSocketConstructor (or a socket), and naming what it registers on the emitter after itself in the timeline
   */
  private playgroundWebSocketHandler(trace: Trace): typeof websocket.WebSocketHandler {
    const server = this.server;
    const handlers = this.handlers;
    return class PlaygroundWebSocketHandler extends websocket.WebSocketHandler {
      constructor(...[urlOrSocket, evem, options = {}]: ConstructorParameters<typeof websocket.WebSocketHandler>) {
        const connect =
          server && typeof urlOrSocket === 'string' && !options.WebSocketConstructor
            ? { ...options, WebSocketConstructor: server.socketClass }
            : options;
        trace.owner = 'WebSocketHandler';
        try {
          super(urlOrSocket, evem, connect);
        } finally {
          trace.owner = undefined;
        }
        handlers.push(this);
      }
    };
  }

  /** The scenario's names for its helpers, which a production build's minifier would otherwise rename */
  private helperNames(): Map<Function, string> {
    return new Map(Object.entries(this.scenario.helpers).map(([name, helper]) => [helper as Function, name]));
  }

  /**
   * The `console` the scenario's code sees: what it logs goes to `trace` (`info` and `debug` as logs); its other
   * methods (`table`, `time`, …) are the page's
   */
  private consoleForCode(trace: Trace): Console {
    const record =
      (level: 'log' | 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: args.map(formatArgument).join(' ') });
    return Object.assign(Object.create(console) as Console, {
      log: record('log'),
      info: record('log'),
      debug: record('log'),
      warn: record('warn'),
      error: record('error')
    });
  }

  /**
   * Run `work`, recording in `trace` what the library logs meanwhile: EvEm's warnings and errors ("Error in event
   * handler …") and what it prints with console.log and console.group (memory leak details), indented by group
   */
  private async capturingLogs<V>(trace: Trace, work: () => Promise<V>): Promise<V> {
    let depth = 0;
    const record =
      (level: 'log' | 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: '  '.repeat(depth) + args.map(formatArgument).join(' ') });
    const group = (...args: unknown[]) => {
      record('log')(...args);
      depth++;
    };
    const capture: Pick<Console, Captured> = {
      log: record('log'),
      info: record('log'),
      warn: record('warn'),
      error: record('error'),
      group,
      groupCollapsed: group,
      groupEnd: () => {
        depth = Math.max(0, depth - 1);
      }
    };
    Object.assign(console, capture);
    try {
      return await work();
    } finally {
      // Undo only this capture, back to the page's console: a newer run that replaced it undoes its own, so a run
      // that never finishes (or finishes late) can't keep the console
      const own = console as unknown as Record<Captured, unknown>;
      for (const method of CAPTURED) {
        if (own[method] === capture[method]) own[method] = pageConsole[method];
      }
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
    const line = JSON.stringify(value);
    if (line === undefined) return String(value);
    // Long values (info() output, history records) read better indented, one property per line
    return line.length <= 80 ? line : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
