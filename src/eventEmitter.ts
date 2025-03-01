import { v4 as uuid } from "uuid";
type EventCallback<T = unknown> = (args: T) => void | Promise<void>;
type FilterPredicate<T = unknown> = (args: T) => boolean | Promise<boolean>;
type SubscriptionOptions<T = unknown> = {
  filter?: FilterPredicate<T> | FilterPredicate<T>[];
  debounceTime?: number;
  throttleTime?: number;
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
  private throttleTimers = new Map<string, { timer: NodeJS.Timeout, expiresAt: number }>();
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

    // Generate a subscription ID early so we can use it in the throttle/debounce callbacks
    const subscriptionId = uuid();
    
    // We'll start with a reference to the original callback
    let finalCallback = callback;
    
    // Start by building the callback chain with filter, throttle, and debounce
    // Order matters here:
    // 1. Filter is applied first (closest to original callback)
    // 2. Throttle is applied second
    // 3. Debounce is applied last (outermost wrapper)
    
    // Apply filters if needed
    const filters = options?.filter ? 
      (Array.isArray(options.filter) ? options.filter : [options.filter]) : 
      null;
    
    if (filters) {
      const originalCallback = finalCallback;
      finalCallback = async (args: T) => {
        // Apply each filter in series (short-circuiting on first false)
        for (const filter of filters) {
          const result = filter(args);
          const passes = result instanceof Promise ? await result : result;
          if (!passes) return; // If any filter fails, don't call the callback
        }
        // All filters passed, call the original callback
        return originalCallback(args);
      };
    }
    
    // Store the original callback before applying throttling/debouncing
    const filteredCallback = finalCallback;
    
    // Decide what type of time-based control to apply
    const hasThrottle = options?.throttleTime && options.throttleTime > 0;
    const hasDebounce = options?.debounceTime && options.debounceTime > 0;
    
    // Handle throttle only
    if (hasThrottle && !hasDebounce) {
      const throttleTime = options.throttleTime!;
      
      // Create a wrapper that implements the throttle logic
      finalCallback = (args: T) => {
        // Use the subscription ID as the timer key for consistent handling
        const timerId = `throttle_${event}_${subscriptionId}`;
        const now = Date.now();
        
        // Check if we're currently throttled
        if (this.throttleTimers.has(timerId)) {
          const throttleData = this.throttleTimers.get(timerId)!;
          
          // If the throttle window hasn't expired, ignore this event
          if (now < throttleData.expiresAt) {
            return;
          }
          
          // Throttle window has expired, clean up the old timer
          clearTimeout(throttleData.timer);
          this.throttleTimers.delete(timerId);
        }
        
        // Set up a new throttle window
        const expiresAt = now + throttleTime;
        const timer = setTimeout(() => {
          this.throttleTimers.delete(timerId);
        }, throttleTime);
        
        this.throttleTimers.set(timerId, { timer, expiresAt });
        
        // Execute the callback right away (throttle processes the first event immediately)
        return filteredCallback(args);
      };
    }
    // Handle debounce only
    else if (!hasThrottle && hasDebounce) {
      const debounceTime = options.debounceTime!;
      
      // Create a wrapper that implements the debounce logic
      finalCallback = (args: T) => {
        // Use the subscription ID as the timer key for consistent handling
        const timerId = `debounce_${event}_${subscriptionId}`;
        
        // Clear any existing timer for this callback
        if (this.debounceTimers.has(timerId)) {
          clearTimeout(this.debounceTimers.get(timerId));
        }
        
        // Set a new timer
        const timer = setTimeout(() => {
          this.debounceTimers.delete(timerId);
          // Execute the callback directly
          filteredCallback(args);
        }, debounceTime);
        
        this.debounceTimers.set(timerId, timer);
        // Return void to prevent awaiting the timeout in the publish method
        return;
      };
    }
    // Handle both throttle and debounce
    else if (hasThrottle && hasDebounce) {
      const throttleTime = options.throttleTime!;
      const debounceTime = options.debounceTime!;
      
      // Track the last throttled time to know if we need to debounce
      const throttleState = { lastThrottledTime: 0 };
      
      // Combined throttle + debounce logic
      finalCallback = (args: T) => {
        const timerId = `combined_${event}_${subscriptionId}`;
        const now = Date.now();
        
        // Check if throttling allows this event to pass through
        let shouldProcessNow = false;
        
        // If no throttle window or it has expired, we can process immediately
        if (now - throttleState.lastThrottledTime > throttleTime) {
          throttleState.lastThrottledTime = now;
          shouldProcessNow = true;
        }
        
        // Clear any existing debounce timer
        if (this.debounceTimers.has(timerId)) {
          clearTimeout(this.debounceTimers.get(timerId));
        }
        
        // If it should process now due to throttle, do it immediately
        if (shouldProcessNow) {
          return filteredCallback(args);
        }
        
        // Otherwise, debounce it
        const timer = setTimeout(() => {
          this.debounceTimers.delete(timerId);
          filteredCallback(args);
        }, debounceTime);
        
        this.debounceTimers.set(timerId, timer);
        return;
      };
    }

    // Register the final wrapped callback
    const callbacks = this.events.get(event) ?? new Map();
    callbacks.set(subscriptionId, finalCallback as EventCallback);
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
        const debounceTimerKey = `debounce_${event}_${id}`;
        if (this.debounceTimers.has(debounceTimerKey)) {
          clearTimeout(this.debounceTimers.get(debounceTimerKey));
          this.debounceTimers.delete(debounceTimerKey);
        }
        
        // Clean up any throttle timers associated with this subscription
        const throttleTimerKey = `throttle_${event}_${id}`;
        if (this.throttleTimers.has(throttleTimerKey)) {
          clearTimeout(this.throttleTimers.get(throttleTimerKey)!.timer);
          this.throttleTimers.delete(throttleTimerKey);
        }
        
        // Clean up any combined throttle+debounce timers
        const combinedTimerKey = `combined_${event}_${id}`;
        if (this.debounceTimers.has(combinedTimerKey)) {
          clearTimeout(this.debounceTimers.get(combinedTimerKey));
          this.debounceTimers.delete(combinedTimerKey);
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
