import type { AnyEvEm, EventCallback, PublishOptions, SubscriptionOptions } from '../eventEmitter.js';
import { localName } from '../shared/names.js';
import type { ConnectionState } from '../shared/types.js';

/**
 * The parts of Alpine the plugin uses (Alpine 3), typed here so the plugin depends on no Alpine package
 */
export interface AlpineLike {
  magic(name: string, callback: (el: Element, utilities: { cleanup: (callback: () => void) => void }) => unknown): void;
  store(name: string, value: object): void;
  store(name: string): unknown;
}

/** The parts of an SseHandler the store follows */
export interface ConnectionLike {
  getConnectionState(): ConnectionState;
  isReady(): boolean;
}

export interface EvemAlpineOptions {
  /** An SseHandler whose connection the store follows (`$store.evem.state`, `$store.evem.ready`) */
  sse?: ConnectionLike;
  /** The magic's name, `$evem` @default 'evem' */
  magic?: string;
  /** The store's name, `$store.evem` @default 'evem' */
  store?: string;
}

/** What `$evem` gives templates */
export interface EvemMagic {
  /** Publish an event, as evem.publish() */
  publish<T = unknown>(event: string, data?: T, options?: PublishOptions | number): Promise<boolean>;
  /**
   * Subscribe, as evem.subscribe(), for as long as the element lives: Alpine unsubscribes when it removes the
   * element (an htmx swap, x-if, x-for). Returns the subscription, to unsubscribe sooner.
   */
  on<T = unknown>(pattern: string, callback: EventCallback<T>, options?: SubscriptionOptions<T>): EvemSubscription;
}

/**
 * A subscription made with `$evem.on()`. An object rather than an unsubscribe function: Alpine calls a function
 * an expression evaluates to, so `x-init="$evem.on(…)"` would unsubscribe at once
 */
export interface EvemSubscription {
  /** The subscription id, as evem.subscribe() returns it */
  id: string;
  /** Unsubscribe now, before the element goes */
  unsubscribe(): void;
}

/** The store's state, with the sse option */
export interface EvemStore {
  state: ConnectionState;
  ready: boolean;
}

/**
 * An Alpine plugin for an EvEm instance: `Alpine.plugin(evemAlpine(evem, { sse }))`, before `Alpine.start()`.
 * Templates get `$evem.publish()` and `$evem.on()`, whose subscriptions end with their element, and, with the
 * `sse` option, a reactive `$store.evem` with the connection's `state` and whether it's `ready`.
 */
export function evemAlpine(evem: AnyEvEm, options: EvemAlpineOptions = {}): (Alpine: AlpineLike) => void {
  return Alpine => {
    Alpine.magic(options.magic ?? 'evem', (_el, { cleanup }): EvemMagic => ({
      publish: (event, data, publishOptions) => evem.publish(event, data, publishOptions),
      on: (pattern, callback, subscribeOptions) => {
        const id = evem.subscribe(pattern, callback, subscribeOptions);
        const unsubscribe = () => evem.unsubscribeById(id);
        cleanup(unsubscribe);
        return { id, unsubscribe };
      }
    }));

    const { sse } = options;
    if (sse) {
      const name = options.store ?? 'evem';
      Alpine.store(name, { state: sse.getConnectionState(), ready: sse.isReady() } satisfies EvemStore);
      // The reactive copy Alpine made
      const store = Alpine.store(name) as EvemStore;
      const follow = () => {
        store.state = sse.getConnectionState();
        store.ready = sse.isReady();
      };
      evem.subscribe(localName(evem, 'sse.connection.state'), follow);
      evem.subscribe(localName(evem, 'sse.ready'), follow);
    }
  };
}
