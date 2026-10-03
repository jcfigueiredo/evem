import {
  EvEm,
  type EventCallback,
  type MiddlewareConfig,
  type MiddlewareFunction,
  type PublishOptions,
  type SubscriptionOptions
} from '@jcfigueiredo/evem';
import type { SkipReason, Trace } from './trace';
import { explainMatch } from './wildcards';

/**
 * EvEm's own wildcard matching (private: the timeline must decide "this subscription matched" exactly as EvEm
 * does). Reached here only; a test pins it to the documented wildcard rules.
 */
export function matchesPattern(evem: EvEm, event: string, pattern: string): boolean {
  return (evem as unknown as { isEventMatch(event: string, pattern: string): boolean }).isEventMatch(event, pattern);
}

/** EvEm's own test for a middleware result that reroutes the event (private, like isEventMatch) */
function isReroute(evem: EvEm, result: unknown): result is { event: string; data: unknown } {
  return (evem as unknown as { isMiddlewareReroute(result: unknown): boolean }).isMiddlewareReroute(result);
}

/**
 * EvEm's private publish-chain methods (private, like isEventMatch). Every publish creates its own chain, before
 * its first await, and EvEm runs each of its handlers inside that chain, so the chain says which publish a handler
 * belongs to.
 */
interface PublishChains {
  enterPublishChain(event: string): Map<string, number>;
  runInPublishChain<R>(chain: Map<string, number> | null, fn: () => R): R;
}

/** Call `onValue` with a value, or with what a promise resolves to; returns the value or promise unchanged */
function settle<V>(value: V, onValue: (resolved: Awaited<V>) => void): V {
  if (value instanceof Promise) {
    return value.then(resolved => {
      onValue(resolved);
      return resolved;
    }) as V;
  }
  onValue(value as Awaited<V>);
  return value;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isCanceled = (data: unknown) =>
  typeof data === 'object' && data !== null && (data as { canceled?: unknown }).canceled === true;

interface Subscription {
  id: string;
  name: string;
  pattern: string;
  options: SubscriptionOptions<any, any> | undefined;
  original: EventCallback<any>;
  wrapped: EventCallback<any>;
}

/** What happened to the subscriptions during one publish */
interface PublishState {
  id: number;
  /** The event name after middleware reroutes */
  event: string;
  live: Subscription[];
  called: Set<string>;
  filtered: Set<string>;
  invalid: Set<string>;
  canceled: boolean;
}

function describeOptions(options: SubscriptionOptions<any, any> | undefined): string[] {
  if (!options) return [];
  const described: string[] = [];
  if (options.priority !== undefined) described.push(`priority ${String(options.priority)}`);
  if (options.filter) described.push(Array.isArray(options.filter) ? `${options.filter.length} filters` : 'filter');
  if (options.schema) described.push('schema');
  if (options.throttleTime !== undefined) described.push(`throttle ${options.throttleTime} ms`);
  if (options.debounceTime !== undefined) described.push(`debounce ${options.debounceTime} ms`);
  if (options.once) described.push('once');
  if (options.transform) described.push('transform');
  if (options.replayLastEvent) described.push('replay last');
  if (options.replayHistory) described.push('replay history');
  return described;
}

/**
 * An EvEm that records what it does in `trace`, for the timeline. It only observes: every method calls the real
 * one with wrappers that record calls, verdicts and results and pass everything through unchanged.
 */
/** What else the traced EvEm records */
export interface TraceOptions {
  /** For every publish, whether each subscription's pattern matched the event, and why (the Wildcards scenario) */
  explainMatches?: boolean;
}

export function createTracedEvEm(
  trace: Trace,
  names: ReadonlyMap<Function, string> = new Map(),
  { explainMatches = false }: TraceOptions = {}
): typeof EvEm {
  /** A function's display name: the scenario's name for it, else its own (only code the reader wrote keeps one) */
  const nameOf = (fn: Function, fallback: string) => names.get(fn) ?? (fn.name || fallback);

  return class TracedEvEm extends EvEm {
    private readonly subscriptions = new Map<string, Subscription>();
    private readonly publishes = new Map<number, PublishState>();
    /** Recent publishes, newest last, to attribute calls that happen after their publish (debounce) */
    private readonly history: Array<{ id: number; event: string }> = [];
    private readonly middlewares = new Map<MiddlewareFunction<any>, MiddlewareFunction<any>>();
    /** The publish each publish chain belongs to */
    private readonly chains = new WeakMap<Map<string, number>, number>();
    /** The publish being started, until EvEm has created its chain */
    private starting: number | undefined;
    /** How deep we are in subscribe(): a call that happens there, outside any publish, is a history replay */
    private subscribing = 0;
    /** Once subscriptions EvEm just removed, which say so after their call (EvEm removes them just before it) */
    private readonly leaving = new Map<string, Subscription>();
    /** Subscriptions removed before subscribe() returned: a once subscription a replay used up */
    private readonly removedWhileSubscribing = new Set<string>();
    /** Numbers the subscribers that have no name */
    private anonymous = 0;

    constructor(...args: ConstructorParameters<typeof EvEm>) {
      super(...args);
      // Follow EvEm's own publish chains: while EvEm runs a handler in a publish's chain, that's the current publish
      const own = this as unknown as PublishChains;
      const enterPublishChain = own.enterPublishChain.bind(this);
      const runInPublishChain = own.runInPublishChain.bind(this);
      own.enterPublishChain = event => {
        const chain = enterPublishChain(event);
        if (this.starting !== undefined) this.chains.set(chain, this.starting);
        return chain;
      };
      own.runInPublishChain = <R>(chain: Map<string, number> | null, fn: () => R): R => {
        const previous = trace.currentPublish;
        trace.currentPublish = chain ? this.chains.get(chain) : undefined;
        try {
          return runInPublishChain(chain, fn);
        } finally {
          trace.currentPublish = previous;
        }
      };
    }

    private current(): PublishState | undefined {
      const id = trace.currentPublish;
      return id === undefined ? undefined : this.publishes.get(id);
    }

    /** The latest publish of an event that `pattern` matches */
    private latestFor(pattern: string): number | undefined {
      for (let index = this.history.length - 1; index >= 0; index--) {
        const publish = this.history[index]!;
        if (matchesPattern(this, publish.event, pattern)) return publish.id;
      }
      return undefined;
    }

    override subscribe<T = unknown, R = any>(
      event: string,
      callback: EventCallback<T>,
      options?: SubscriptionOptions<T, R>
    ): string {
      const name = names.get(callback) ?? (callback.name || `subscriber ${++this.anonymous}`);
      let id = '';
      const wrapped: EventCallback<T> = data => {
        const state = this.current();
        state?.called.add(id);
        // Outside any publish: a replay from history while subscribing, or a call that comes later (debounce)
        const replayed = !state && this.subscribing > 0;
        const publish = state?.id ?? (replayed ? undefined : this.latestFor(event));
        trace.record({
          kind: 'call',
          subscription: name,
          data,
          publish,
          ...(replayed ? { replayed: true } : state ? {} : { later: true })
        });
        if (this.leaving.delete(id)) trace.record({ kind: 'unsubscribe', subscription: name, once: true, publish });
        const wasCanceled = isCanceled(data);
        const afterCall = () => {
          if (!wasCanceled && isCanceled(data)) {
            if (state) state.canceled = true;
            trace.record({ kind: 'cancel', subscription: name, publish });
          }
        };
        const failed = (error: unknown) =>
          trace.record({ kind: 'error', subscription: name, message: messageOf(error), publish });
        try {
          const result = callback(data);
          if (result instanceof Promise) {
            return result.then(
              value => {
                afterCall();
                return value;
              },
              (error: unknown) => {
                failed(error);
                throw error;
              }
            );
          }
          afterCall();
          return result;
        } catch (error) {
          failed(error);
          throw error;
        }
      };
      const traced = options ? this.traceOptions(options, name, () => id) : undefined;
      // Recorded first, so a history replay (which runs inside subscribe) comes after it
      trace.record({ kind: 'subscribe', subscription: name, pattern: event, options: describeOptions(options) });
      this.subscribing++;
      try {
        id = super.subscribe(event, wrapped, traced);
      } finally {
        this.subscribing--;
      }
      if (this.removedWhileSubscribing.delete(id)) {
        trace.record({ kind: 'unsubscribe', subscription: name, once: true });
      } else {
        this.subscriptions.set(id, { id, name, pattern: event, options, original: callback, wrapped });
      }
      return id;
    }

    private traceOptions<T, R>(
      options: SubscriptionOptions<T, R>,
      name: string,
      id: () => string
    ): SubscriptionOptions<T, R> {
      const traced: SubscriptionOptions<T, R> = { ...options };
      if (options.filter) {
        const filters = Array.isArray(options.filter) ? options.filter : [options.filter];
        const wrappedFilters = filters.map((filter, index) => {
          const filterName = nameOf(filter, filters.length > 1 ? `filter ${index + 1}` : 'filter');
          return (data: T) => {
            const state = this.current();
            const publish = trace.currentPublish;
            return settle(filter(data), passed => {
              if (!passed) state?.filtered.add(id());
              trace.record({ kind: 'filter', subscription: name, name: filterName, passed: Boolean(passed), publish });
            });
          };
        });
        traced.filter = Array.isArray(options.filter) ? wrappedFilters : wrappedFilters[0];
      }
      if (options.schema) {
        const schema = options.schema;
        traced.schema = ((data: T) => {
          const state = this.current();
          const publish = trace.currentPublish;
          return settle(schema(data), result => {
            const valid = typeof result === 'boolean' ? result : Boolean(result?.valid);
            if (!valid) state?.invalid.add(id());
            trace.record({ kind: 'schema', subscription: name, valid, publish });
          });
        }) as typeof schema;
      }
      if (options.transform) {
        const transform = options.transform;
        traced.transform = (data: T) => {
          const publish = trace.currentPublish;
          return settle(transform(data), result =>
            trace.record({ kind: 'transform', subscription: name, data: result, publish })
          );
        };
      }
      return traced;
    }

    override unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void {
      // EvEm removes the first subscription to `event` made with `callback`
      for (const subscription of this.subscriptions.values()) {
        if (subscription.pattern === event && subscription.original === callback) {
          super.unsubscribe(event, subscription.wrapped);
          this.forget(subscription);
          return;
        }
      }
      super.unsubscribe(event, callback);
    }

    override unsubscribeById(id: string): void {
      super.unsubscribeById(id);
      const subscription = this.subscriptions.get(id);
      if (!subscription) {
        if (this.subscribing > 0) this.removedWhileSubscribing.add(id);
        return;
      }
      if (subscription.options?.once) {
        // EvEm removes a once subscription just before calling it: its wrapped callback says so after the call, and
        // if no call follows (an explicit unsubscribe), this does
        this.subscriptions.delete(id);
        this.leaving.set(id, subscription);
        queueMicrotask(() => {
          if (this.leaving.delete(id)) trace.record({ kind: 'unsubscribe', subscription: subscription.name });
        });
        return;
      }
      this.forget(subscription);
    }

    private forget(subscription: Subscription): void {
      this.subscriptions.delete(subscription.id);
      trace.record({ kind: 'unsubscribe', subscription: subscription.name });
    }

    override use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const name = nameOf(handler, `middleware ${this.middlewares.size + 1}`);
      const traced: MiddlewareFunction<T> = (event, data) => {
        const state = this.current();
        const publish = trace.currentPublish;
        return settle(handler(event, data), result => {
          if (result === null) {
            trace.record({ kind: 'middleware', name, outcome: 'cancel', publish });
          } else if (result !== data && isReroute(this, result)) {
            if (state) state.event = result.event;
            trace.record({
              kind: 'middleware',
              name,
              outcome: 'reroute',
              to: result.event,
              data: result.data,
              publish
            });
          } else {
            trace.record({ kind: 'middleware', name, outcome: 'continue', data: result, publish });
          }
        });
      };
      this.middlewares.set(handler, traced);
      super.use(typeof middleware === 'function' ? traced : { ...middleware, handler: traced });
    }

    override removeMiddleware<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const traced = (this.middlewares.get(handler) ?? handler) as MiddlewareFunction<T>;
      super.removeMiddleware(typeof middleware === 'function' ? traced : { ...middleware, handler: traced });
    }

    override async publish<T = unknown>(event: string, args?: T, options?: PublishOptions | number): Promise<boolean> {
      const parent = trace.currentPublish;
      const id = trace.startPublish(parent);
      trace.record({ kind: 'publish', id, event, data: args, publish: parent });
      const state: PublishState = {
        id,
        event,
        live: [...this.subscriptions.values()],
        called: new Set(),
        filtered: new Set(),
        invalid: new Set(),
        canceled: false
      };
      this.publishes.set(id, state);
      if (explainMatches) {
        for (const subscription of state.live) {
          const { matched, reason } = explainMatch(event, subscription.pattern);
          const pattern = subscription.pattern;
          trace.record({
            kind: 'match',
            subscription: subscription.name,
            pattern,
            event,
            matched,
            reason,
            publish: id
          });
        }
      }
      this.history.push({ id, event });
      if (this.history.length > 50) this.history.shift();
      // EvEm creates this publish's chain before its first await, so this is set while it does
      const starting = this.starting;
      this.starting = id;
      let pending: Promise<boolean>;
      try {
        pending = super.publish(event, args, options);
      } finally {
        this.starting = starting;
      }
      try {
        const result = await pending;
        this.recordSkips(state, result);
        trace.record({ kind: 'result', id, result, publish: parent });
        return result;
      } catch (error) {
        this.recordSkips(state, 'rejected');
        trace.record({ kind: 'rejected', id, error: messageOf(error), publish: parent });
        throw error;
      } finally {
        trace.endPublish(id);
        this.publishes.delete(id);
      }
    }

    /** For every subscription that matched the (final) event but didn't run, say why */
    private recordSkips(state: PublishState, result: boolean | 'rejected'): void {
      for (const subscription of state.live) {
        if (state.called.has(subscription.id) || !matchesPattern(this, state.event, subscription.pattern)) continue;
        const options = subscription.options;
        const reason: SkipReason = state.invalid.has(subscription.id)
          ? 'schema'
          : state.filtered.has(subscription.id)
            ? 'filtered'
            : options?.debounceTime !== undefined
              ? 'debounced'
              : options?.throttleTime !== undefined
                ? 'throttled'
                : result === 'rejected'
                  ? 'stopped'
                  : state.canceled || !result
                    ? 'canceled'
                    : 'not-called';
        trace.record({ kind: 'skip', subscription: subscription.name, reason, publish: state.id });
      }
    }
  };
}
