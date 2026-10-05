import type { AnyEvEm, MiddlewareConfig } from '../eventEmitter.js';
import { publishSafely } from '../shared/publishSafely.js';

export interface DomBridgeOptions {
  /** Where to dispatch, or listen for, the DOM events @default the global window */
  target?: EventTarget;
  /** The name on the other side: the DOM event for an EvEm event (bridgeToDom), or the reverse @default the same */
  rename?: (name: string) => string;
}

/** CustomEvents the bridge dispatched, which bridgeFromDom must not bring back */
const dispatchedByBridge = new WeakSet<Event>();
/** Per emitter, the EvEm names being published from the DOM right now, which bridgeToDom must not send back */
const arrivingFromDom = new WeakMap<AnyEvEm, Map<string, number>>();

function targetOf(options: DomBridgeOptions): EventTarget {
  if (options.target) {
    return options.target;
  }
  const page = globalThis as Partial<EventTarget>;
  if (typeof page.dispatchEvent !== 'function' || typeof page.addEventListener !== 'function') {
    throw new TypeError('There is no global window (e.g. in Node.js): pass a target.');
  }
  return page as EventTarget;
}

/**
 * Dispatch the EvEm events the patterns match as DOM CustomEvents, with the data as `detail`, so DOM listeners
 * get them: Alpine's `@toast.window`, htmx's `hx-trigger="toast from:window"`. It's a middleware, so it sees
 * what earlier middleware made of an event (and nothing they canceled); register it after them.
 *
 * @returns A function that stops the bridge
 * @throws {TypeError} Without a target outside browsers
 */
export function bridgeToDom(evem: AnyEvEm, patterns: string | string[], options: DomBridgeOptions = {}): () => void {
  const target = targetOf(options);
  const rename = options.rename ?? ((name: string) => name);
  const middleware: MiddlewareConfig[] = [patterns].flat().map(pattern => ({
    pattern,
    handler: (event: string, data: unknown) => {
      // An event the DOM just sent is already there
      if (!arrivingFromDom.get(evem)?.get(event)) {
        const domEvent = new CustomEvent(rename(event), { detail: data });
        dispatchedByBridge.add(domEvent);
        target.dispatchEvent(domEvent);
      }
      return data;
    }
  }));
  for (const each of middleware) evem.use(each);
  return () => {
    for (const each of middleware) evem.removeMiddleware(each);
  };
}

/**
 * Publish the named DOM events in EvEm, with their `detail` as data, so EvEm subscribers get what Alpine's
 * `$dispatch` or other DOM code sends. Events bridgeToDom dispatched are left alone, so a name can be bridged
 * both ways: each event then reaches each side once.
 *
 * @returns A function that stops the bridge
 * @throws {TypeError} Without a target outside browsers
 */
export function bridgeFromDom(evem: AnyEvEm, names: string | string[], options: DomBridgeOptions = {}): () => void {
  const target = targetOf(options);
  const rename = options.rename ?? ((name: string) => name);
  const listener = (domEvent: Event) => {
    if (dispatchedByBridge.has(domEvent)) {
      return;
    }
    const event = rename(domEvent.type);
    const arriving = arrivingFromDom.get(evem) ?? new Map<string, number>();
    arrivingFromDom.set(evem, arriving);
    arriving.set(event, (arriving.get(event) ?? 0) + 1);
    // Counted, as publishes of the same name can overlap; back at 0, the name is bridged to the DOM again
    void publishSafely(evem, event, (domEvent as CustomEvent).detail, 'the DOM bridge').finally(() => {
      arriving.set(event, arriving.get(event)! - 1);
    });
  };
  const all = [names].flat();
  for (const name of all) target.addEventListener(name, listener);
  return () => {
    for (const name of all) target.removeEventListener(name, listener);
  };
}
