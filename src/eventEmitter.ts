import { v4 as uuid } from "uuid";
type EventCallback<T = unknown> = (args: T) => void | Promise<void>;
type FilterPredicate<T = unknown> = (args: T) => boolean | Promise<boolean>;
type SubscriptionOptions<T = unknown> = {
  filter?: FilterPredicate<T> | FilterPredicate<T>[];
  debounceTime?: number;
};

interface IEventEmitter {
  subscribe<T = unknown>(event: string, callback: EventCallback<T>, options?: SubscriptionOptions<T>): string;
  unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void;
  unsubscribeById(id: string): void;
  publish<T = unknown>(event: string, args?: T, timeout?: number): Promise<void>;
}

class EvEm implements IEventEmitter {
  private events = new Map<string, Map<string, EventCallback>>();
  private recursionDepth = new Map<string, number>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
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

  /**
   * Subscribe to an event with optional filters
   * @param event - The event name to subscribe to
   * @param callback - The callback to invoke when the event is published
   * @param options - Optional subscription options including filters
   * @returns A subscription ID that can be used to unsubscribe
   */
  subscribe<T = unknown>(
    event: string, 
    callback: EventCallback<T>, 
    options?: SubscriptionOptions<T>
  ): string {
    if (!event) throw new Error("Event name cannot be empty.");

    // Create the appropriate callback based on options
    let wrappedCallback: EventCallback<T>;
    const filters = options?.filter ? 
      (Array.isArray(options.filter) ? options.filter : [options.filter]) : 
      null;
    
    // First create a filter wrapper if needed
    if (filters) {
      wrappedCallback = async (args: T) => {
        // Apply each filter in series (short-circuiting on first false)
        for (const filter of filters) {
          const result = filter(args);
          const passes = result instanceof Promise ? await result : result;
          if (!passes) return; // If any filter fails, don't call the callback
        }
        // All filters passed, call the actual callback
        return callback(args);
      };
    } else {
      wrappedCallback = callback;
    }

    // Generate a subscription ID early so we can use it in the debounced callback
    const subscriptionId = uuid();
    
    // Then apply debouncing if needed
    if (options?.debounceTime && options.debounceTime > 0) {
      const debounceTime = options.debounceTime;
      const originalCallback = wrappedCallback;
      
      // Create a wrapper that implements the debounce logic
      const debouncedCallback: EventCallback<T> = (args: T) => {
        // Use the subscription ID as the timer key for consistent handling
        const timerId = `${event}_${subscriptionId}`;
        
        // Clear any existing timer for this callback
        if (this.debounceTimers.has(timerId)) {
          clearTimeout(this.debounceTimers.get(timerId));
        }
        
        // Set a new timer
        const timer = setTimeout(() => {
          this.debounceTimers.delete(timerId);
          // Execute the callback directly rather than through publish to avoid recursion
          originalCallback(args);
        }, debounceTime);
        
        this.debounceTimers.set(timerId, timer);
        // Return void to prevent awaiting the timeout in the publish method
        return;
      };
      
      wrappedCallback = debouncedCallback;
    }

    // Register the wrapped callback
    const callbacks = this.events.get(event) ?? new Map();
    callbacks.set(subscriptionId, wrappedCallback as EventCallback);
    this.events.set(event, callbacks);
    return subscriptionId;
  }

  unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void {
    if (!event) throw new Error("You can't unsubscribe to an event with an empty name.");

    const callbacks = this.events.get(event);
    if (!callbacks) {
      console.warn(`Warning: Attempting to unsubscribe from a non-existent event: ${event}`);
      return;
    }

    for (const [id, cb] of callbacks) {
      if (cb === callback) {
        callbacks.delete(id);
        break;
      }
    }
  }

  unsubscribeById(id: string): void {
    if (!id) throw new Error("You can't unsubscribe to an event with an empty id.");

    // Find and remove the callback
    for (const [event, callbacks] of this.events) {
      if (callbacks.has(id)) {
        callbacks.delete(id);
        
        // Clean up any debounce timers associated with this subscription
        const timerKey = `${event}_${id}`;
        if (this.debounceTimers.has(timerKey)) {
          clearTimeout(this.debounceTimers.get(timerKey));
          this.debounceTimers.delete(timerKey);
        }
        
        break;
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
    let timeoutHandle: ReturnType<typeof setTimeout>;

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

export { 
  EvEm, 
  type IEventEmitter, 
  type EventCallback, 
  type FilterPredicate,
  type SubscriptionOptions
};
