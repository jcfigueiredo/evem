import { v4 as uuid } from "uuid";
type EventCallback<T = unknown> = (args: T) => void | Promise<void>;

interface IEventEmitter {
  subscribe<T = unknown>(event: string, callback: EventCallback<T>): void;
  unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void;
  unsubscribeById(id: string, event?: string): void;
  publish<T = unknown>(event: string, args?: T): Promise<void>;
}

class EvEm implements IEventEmitter {
  private events = new Map<string, Map<string, EventCallback>>();
  private eventMatchCache = new Map<string, Set<string>>();

  private recursionDepth = new Map<string, number>();
  private maxRecursionDepth: number;

  constructor(maxRecursionDepth: number = 3) {
    this.maxRecursionDepth = maxRecursionDepth;
  }

  private incrementRecursionDepth(event: string): void {
    const depth = (this.recursionDepth.get(event) || 0) + 1;
    if (depth > this.maxRecursionDepth) {
      throw new Error(`Max recursion depth of ${this.maxRecursionDepth} exceeded for event '${event}'`);
    }
    this.recursionDepth.set(event, depth);
  }

  private resetRecursionDepth(event: string): void {
    this.recursionDepth.set(event, 0);
  }

  subscribe<T = unknown>(event: string, callback: EventCallback<T>): string {
    if (!event) throw new Error("Event name cannot be empty.");

    const callbacks = this.events.get(event) ?? new Map();
    const id = uuid();
    callbacks.set(id, callback as EventCallback);
    this.events.set(event, callbacks);

    this.eventMatchCache.delete(event);

    return id;
  }

  unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void {
    if (!event) throw new Error("You can't subscribe to an event with an empty name.");

    const callbacks = this.events.get(event);
    if (!callbacks) return;

    for (const [id, cb] of callbacks) {
      if (cb === callback) {
        callbacks.delete(id);
        break;
      }
    }
  }

  unsubscribeById(id: string, event?: string): void {
    if (event) {
      // Unsubscribe from a specific event
      const callbacks = this.events.get(event);
      if (callbacks) {
        callbacks.delete(id);
      }
      return;
    }
    // Unsubscribe from all events if event name is not provided
    for (const [eventName, callbacks] of this.events) {
      if (callbacks.has(id)) {
        callbacks.delete(id);
        break; // Assuming UUIDs are unique across all events
      }
    }
  }

  async publish<T = unknown>(event: string, args?: T, timeout: number = 5000): Promise<void> {
    if (!event) {
      return Promise.reject(new Error("Event name cannot be empty."));
    }

    this.incrementRecursionDepth(event);

    const asyncCallbacks: Promise<void>[] = [];

    for (const [registeredEvent, callbacks] of this.events) {
      if (this.isEventMatch(event, registeredEvent)) {
        for (const callback of callbacks.values()) {
          const callbackPromise = callback(args ?? ({} as T));
          const promise = callbackPromise instanceof Promise ? callbackPromise : Promise.resolve();
          asyncCallbacks.push(this.handlePromiseWithTimeout(promise, timeout));
        }
      }
    }

    await Promise.all(asyncCallbacks);

    this.resetRecursionDepth(event);
  }

  private async handlePromiseWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T | undefined> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<undefined>(resolve => {
      timeoutHandle = setTimeout(() => resolve(undefined), timeout);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutHandle);
    });
  }

  private isEventMatch(event: string, registeredEvent: string): boolean {
    const eventParts = event.split(".");
    const registeredParts = registeredEvent.split(".");

    for (let i = 0; i < Math.max(eventParts.length, registeredParts.length); i++) {
      if (eventParts[i] !== registeredParts[i] && registeredParts[i] !== "*") {
        return false;
      }
    }
    return true;
  }
}

export { EvEm, type IEventEmitter, type EventCallback };
