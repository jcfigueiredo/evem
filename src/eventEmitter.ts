import { v4 as uuid } from "uuid";
type EventCallback<T = unknown> = (args: T) => void | Promise<void>;
type FilterPredicate<T = unknown> = (args: T) => boolean | Promise<boolean>;
type PriorityLevel = 'high' | 'normal' | 'low';

/**
 * Enum defining standard priority levels.
 * Can be used for better type safety when specifying priorities.
 */
export enum Priority {
  /** Low priority handlers execute after normal and high priority handlers (-100) */
  LOW = -100,
  /** Default priority level (0) */
  NORMAL = 0,
  /** High priority handlers execute before normal and high priority handlers (100) */
  HIGH = 100
}

type SubscriptionOptions<T = unknown> = {
  filter?: FilterPredicate<T> | FilterPredicate<T>[];
  debounceTime?: number;
  throttleTime?: number;
  once?: boolean;
  priority?: number | PriorityLevel | Priority; // Can use numbers, strings, or Priority enum
};

interface IEventEmitter {
  subscribe<T = unknown>(event: string, callback: EventCallback<T>, options?: SubscriptionOptions<T>): string;
  subscribeOnce<T = unknown>(event: string, callback: EventCallback<T>, options?: Omit<SubscriptionOptions<T>, 'once'>): string;
  unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void;
  unsubscribeById(id: string): void;
  publish<T = unknown>(event: string, args?: T, timeout?: number): Promise<void>;
}

interface CallbackInfo<T = unknown> {
  callback: EventCallback<T>;
  priority: number;
}

class EvEm implements IEventEmitter {
  private events = new Map<string, Map<string, CallbackInfo>>();
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
    
    // Reference to the original callback
    let finalCallback: EventCallback<T> = callback;
    
    // Build the callback chain:
    // 1. Start with original callback
    // 2. Apply once wrapper if needed
    // 3. Apply filter wrapper if needed
    // 4. Apply throttle/debounce wrappers if needed
    
    // First, wrap with once logic if needed - this allows us to unsubscribe after successfully handling an event
    if (options?.once) {
      const onceOriginalCallback = finalCallback;
      const self = this; // Store reference to 'this' for the closure
      
      // Handle both sync and async callbacks
      if (typeof onceOriginalCallback === 'function') {
        finalCallback = function onceWrapper(args: T) {
          try {
            // Call the original callback
            const result = onceOriginalCallback(args);
            
            // Check if it's a promise
            if (result instanceof Promise) {
              // If it's a promise, wait for it to resolve and then unsubscribe
              return result.then(
                // On success
                (value) => {
                  self.unsubscribeById(subscriptionId);
                  return value;
                },
                // On error
                (error) => {
                  self.unsubscribeById(subscriptionId);
                  throw error;
                }
              );
            } else {
              // If it's not a promise, unsubscribe immediately
              self.unsubscribeById(subscriptionId);
              return result;
            }
          } catch (error) {
            // For synchronous errors
            self.unsubscribeById(subscriptionId);
            throw error;
          }
        };
      } else {
        // Failsafe in case callback is not a function (should never happen)
        finalCallback = function(args: T) {
          self.unsubscribeById(subscriptionId);
          return (onceOriginalCallback as any)(args);
        };
      }
    }
    
    // Then, apply filters if needed - this ensures filters run before the once logic,
    // so once-unsubscribe only happens when a filter passes
    const filters = options?.filter ? 
      (Array.isArray(options.filter) ? options.filter : [options.filter]) : 
      null;
    
    if (filters) {
      const originalCallback = finalCallback;
      
      // Create a function that checks all filters first
      const checkFilters = async (args: T): Promise<boolean> => {
        // Apply each filter in series (short-circuiting on first false)
        for (const filter of filters) {
          try {
            const result = filter(args);
            const passes = result instanceof Promise ? await result : result;
            if (!passes) return false; // Filter failed
          } catch (error) {
            console.error('Filter threw an error:', error);
            return false; // Treat errors in filters as filter failures
          }
        }
        return true; // All filters passed
      };
      
      // Wrap the callback with filter logic
      finalCallback = function filterWrapper(args: T) {
        // Check all filters first
        const filterResult = checkFilters(args);
        
        // If filterResult is a promise (async filter)
        if (filterResult instanceof Promise) {
          return filterResult.then(passes => {
            // If all filters passed, call the original callback
            if (passes) {
              return originalCallback(args);
            }
            // Otherwise return undefined (without calling the callback)
            return undefined;
          });
        } else if (filterResult) {
          // If all filters passed synchronously, call the original callback
          return originalCallback(args);
        }
        // Otherwise don't call the callback
        return undefined;
      };
    }
    
    // Store reference to the callback with filter and once logic
    // This will be called by the throttle/debounce wrappers
    const processedCallback = finalCallback;
    
    // Apply throttle/debounce logic
    const hasThrottle = options?.throttleTime && options.throttleTime > 0;
    const hasDebounce = options?.debounceTime && options.debounceTime > 0;
    
    // Handle throttle only
    if (hasThrottle && !hasDebounce) {
      const throttleTime = options.throttleTime!;
      
      finalCallback = (args: T) => {
        const timerId = `throttle_${event}_${subscriptionId}`;
        const now = Date.now();
        
        // Check if we're currently throttled
        if (this.throttleTimers.has(timerId)) {
          const throttleData = this.throttleTimers.get(timerId)!;
          
          // If throttle window hasn't expired, ignore this event
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
        
        // Execute the callback immediately (throttle processes first event right away)
        return processedCallback(args);
      };
    }
    // Handle debounce only
    else if (!hasThrottle && hasDebounce) {
      const debounceTime = options.debounceTime!;
      
      finalCallback = (args: T) => {
        const timerId = `debounce_${event}_${subscriptionId}`;
        
        // Clear any existing timer for this callback
        if (this.debounceTimers.has(timerId)) {
          clearTimeout(this.debounceTimers.get(timerId));
        }
        
        // Set a new timer
        const timer = setTimeout(() => {
          this.debounceTimers.delete(timerId);
          // Execute the callback directly
          processedCallback(args);
        }, debounceTime);
        
        this.debounceTimers.set(timerId, timer);
        return;
      };
    }
    // Handle both throttle and debounce
    else if (hasThrottle && hasDebounce) {
      const throttleTime = options.throttleTime!;
      const debounceTime = options.debounceTime!;
      
      // Track the last throttled time
      const throttleState = { lastThrottledTime: 0 };
      
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
          return processedCallback(args);
        }
        
        // Otherwise, debounce it
        const timer = setTimeout(() => {
          this.debounceTimers.delete(timerId);
          processedCallback(args);
        }, debounceTime);
        
        this.debounceTimers.set(timerId, timer);
        return;
      };
    }

    // Convert priority option to a numeric value
    let priority = 0; // Default priority (normal)
    
    if (options?.priority !== undefined) {
      if (typeof options.priority === 'number') {
        priority = options.priority;
      } else {
        // Convert string priority levels to numbers
        switch (options.priority) {
          case 'high':
            priority = 100;
            break;
          case 'low':
            priority = -100;
            break;
          case 'normal':
          default:
            priority = 0;
            break;
        }
      }
    }
    
    // Register the final wrapped callback with its priority
    const callbacks = this.events.get(event) ?? new Map();
    callbacks.set(subscriptionId, {
      callback: finalCallback as EventCallback,
      priority
    });
    this.events.set(event, callbacks);
    return subscriptionId;
  }
  
  /**
   * Subscribe to an event that will automatically unsubscribe after the first occurrence
   * @param event - The event name to subscribe to
   * @param callback - The callback to invoke when the event is published
   * @param options - Optional subscription options including filters, throttle, and debounce (except 'once')
   * @returns A subscription ID that can be used to unsubscribe before the event occurs
   */
  subscribeOnce<T = unknown>(
    event: string, 
    callback: EventCallback<T>, 
    options?: Omit<SubscriptionOptions<T>, 'once'>
  ): string {
    // Simply uses the subscribe method with once:true added to the options
    return this.subscribe(event, callback, { ...options, once: true });
  }

  unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void {
    if (!event) throw new Error("You can't unsubscribe to an event with an empty name.");

    const callbacks = this.events.get(event);
    if (!callbacks) {
      console.warn(`Warning: Attempting to unsubscribe from a non-existent event: ${event}`);
      return;
    }

    for (const [id, cbInfo] of callbacks) {
      if (cbInfo.callback === callback) {
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
    const matchingCallbacks: { callback: EventCallback, priority: number }[] = [];

    // First, collect all matching callbacks with their priorities
    for (const [registeredEvent, callbacks] of this.events) {
      if (this.isEventMatch(event, registeredEvent)) {
        for (const [_, cbInfo] of callbacks) {
          matchingCallbacks.push({
            callback: cbInfo.callback,
            priority: cbInfo.priority
          });
        }
      }
    }

    // Sort callbacks by priority (highest first)
    matchingCallbacks.sort((a, b) => b.priority - a.priority);

    // Execute callbacks in priority order
    for (const { callback } of matchingCallbacks) {
      const callbackPromise = callback(args ?? ({} as T));
      const promise = callbackPromise instanceof Promise ? callbackPromise : Promise.resolve();
      asyncCallbacks.push(this.handlePromiseWithTimeout(promise, timeout));
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
  type SubscriptionOptions,
  type PriorityLevel
};
