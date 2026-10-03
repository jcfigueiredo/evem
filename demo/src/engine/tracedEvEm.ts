import {
  EvEm,
  type EventCallback,
  type MiddlewareConfig,
  type MiddlewareFunction,
  type PublishOptions,
  type SubscriptionOptions
} from '@jcfigueiredo/evem';
import type { SkipReason, Trace } from './trace';

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
export function createTracedEvEm(trace: Trace, names: ReadonlyMap<Function, string> = new Map()): typeof EvEm {
  /** A function's display name: the scenario's name for it, else its own (only code the reader wrote keeps one) */
  const nameOf = (fn: Function, fallback: string) => names.get(fn) ?? (fn.name || fallback);

  return class TracedEvEm extends EvEm {
    private readonly subscriptions = new Map<string, Subscription>();
    private readonly publishes = new Map<number, PublishState>();
    /** Recent publishes, newest last, to attribute calls that happen after their publish (debounce) */
    private readonly history: Array<{ id: number; event: string }> = [];
    private readonly middlewares = new Map<MiddlewareFunction<any>, MiddlewareFunction<any>>();

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
      const name = nameOf(callback, `subscriber ${this.subscriptions.size + 1}`);
      let id = '';
      const wrapped: EventCallback<T> = data => {
        const state = this.current();
        state?.called.add(id);
        const publish = state?.id ?? this.latestFor(event);
        trace.record({ kind: 'call', subscription: name, data, publish, ...(state ? {} : { later: true }) });
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
      id = super.subscribe(event, wrapped, traced);
      this.subscriptions.set(id, { id, name, pattern: event, options, original: callback, wrapped });
      trace.record({ kind: 'subscribe', subscription: name, pattern: event, options: describeOptions(options) });
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
          return (data: T) =>
            settle(filter(data), passed => {
              const state = this.current();
              if (!passed) state?.filtered.add(id());
              trace.record({ kind: 'filter', subscription: name, name: filterName, passed: Boolean(passed) });
            });
        });
        traced.filter = Array.isArray(options.filter) ? wrappedFilters : wrappedFilters[0];
      }
      if (options.schema) {
        const schema = options.schema;
        traced.schema = ((data: T) =>
          settle(schema(data), result => {
            const valid = typeof result === 'boolean' ? result : Boolean(result?.valid);
            if (!valid) this.current()?.invalid.add(id());
            trace.record({ kind: 'schema', subscription: name, valid });
          })) as typeof schema;
      }
      if (options.transform) {
        const transform = options.transform;
        traced.transform = (data: T) =>
          settle(transform(data), result => trace.record({ kind: 'transform', subscription: name, data: result }));
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
      if (subscription) this.forget(subscription);
    }

    private forget(subscription: Subscription): void {
      this.subscriptions.delete(subscription.id);
      trace.record({ kind: 'unsubscribe', subscription: subscription.name });
    }

    override use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const name = nameOf(handler, `middleware ${this.middlewares.size + 1}`);
      const traced: MiddlewareFunction<T> = (event, data) =>
        settle(handler(event, data), result => {
          const state = this.current();
          if (result === null) {
            trace.record({ kind: 'middleware', name, outcome: 'cancel' });
          } else if (result !== data && isReroute(this, result)) {
            if (state) state.event = result.event;
            trace.record({ kind: 'middleware', name, outcome: 'reroute', to: result.event });
          } else {
            trace.record({ kind: 'middleware', name, outcome: 'continue' });
          }
        });
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
      const id = trace.openPublish();
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
      this.history.push({ id, event });
      if (this.history.length > 50) this.history.shift();
      try {
        const result = await super.publish(event, args, options);
        this.recordSkips(state, result);
        trace.record({ kind: 'result', id, result, publish: parent });
        return result;
      } catch (error) {
        this.recordSkips(state, false);
        trace.record({ kind: 'rejected', id, error: messageOf(error), publish: parent });
        throw error;
      } finally {
        trace.closePublish(id);
        this.publishes.delete(id);
      }
    }

    /** For every subscription that matched the (final) event but didn't run, say why */
    private recordSkips(state: PublishState, result: boolean): void {
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
                : state.canceled || !result
                  ? 'canceled'
                  : 'not-called';
        trace.record({ kind: 'skip', subscription: subscription.name, reason, publish: state.id });
      }
    }
  };
}
