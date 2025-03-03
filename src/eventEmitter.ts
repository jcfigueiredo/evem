import { v4 as uuid } from "uuid";

/**
 * Interface for cancelable events that can be canceled by subscribers
 */
export interface CancelableEvent {
  /** Flag to indicate whether the event is canceled */
  canceled: boolean;
  /** Method to cancel the event */
  cancel(): void;
}

type EventCallback<T = unknown> = (args: T) => void | Promise<void>;
type FilterPredicate<T = unknown> = (args: T) => boolean | Promise<boolean>;
type PriorityLevel = 'high' | 'normal' | 'low';

/**
 * Defines how errors in event callbacks are handled
 */
export enum ErrorPolicy {
  /** Log the error and continue with the next callback (default) */
  LOG_AND_CONTINUE = 'log-and-continue',
  /** Silently ignore errors and continue with the next callback */
  SILENT = 'silent',
  /** Stop event propagation when an error occurs */
  CANCEL_ON_ERROR = 'cancel-on-error',
  /** Rethrow the error, stopping event propagation and passing the error to the caller */
  THROW = 'throw'
}

/**
 * Options for publishing an event
 */
export interface PublishOptions {
  /** Optional timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Whether the event can be canceled by subscribers (default: false) */
  cancelable?: boolean;
  /** How errors in callbacks should be handled (default: ErrorPolicy.LOG_AND_CONTINUE) */
  errorPolicy?: ErrorPolicy;
}

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

/**
 * Function to transform event data before it's passed to the next subscriber
 */
type TransformFunction<T = unknown, R = any> = (data: T) => R | Promise<R>;

type SubscriptionOptions<T = unknown, R = any> = {
  filter?: FilterPredicate<T> | FilterPredicate<T>[];
  debounceTime?: number;
  throttleTime?: number;
  once?: boolean;
  priority?: number | PriorityLevel | Priority; // Can use numbers, strings, or Priority enum
  transform?: TransformFunction<T, R>; // Transform event data before passing to next subscriber
  replayLastEvent?: boolean; // Replay the most recent event on subscription
  replayHistory?: boolean; // Replay all historical events for this event pattern on subscription
};

/**
 * Result from a middleware function
 * - Return null to cancel the event
 * - Return the modified data to continue with the modified data
 * - Return an object with event and data to change the event name and data
 */
export type MiddlewareResult<T = any> = null | T | { event: string; data: T };

/**
 * Middleware function definition
 * @param event - The event name
 * @param data - The event data
 * @returns A MiddlewareResult that can modify or cancel the event
 */
export type MiddlewareFunction<T = any> = 
  (event: string, data: T) => MiddlewareResult<T> | Promise<MiddlewareResult<T>>;

/**
 * Middleware configuration
 */
export interface MiddlewareConfig<T = any> {
  /** The event pattern this middleware should apply to (e.g., "user.*", "*.created") */
  pattern?: string;
  /** The middleware function */
  handler: MiddlewareFunction<T>;
}

/**
 * Information about an event subscription or middleware
 */
/**
 * Represents a record of a published event
 */
export interface EventRecord<T = any> {
  /** The event name */
  event: string;
  /** The event data */
  data: T;
  /** When the event was published */
  timestamp: number;
}

export interface EventInfo {
  /** The event name or pattern */
  event: string;
  /** Whether this is a middleware entry */
  isMiddleware: boolean;
  /** For subscriptions: subscriber ID */
  id?: string;
  /** For subscriptions: callback priority */
  priority?: number;
  /** For middleware: event pattern it matches */
  pattern?: string;
}

interface IEventEmitter {
  subscribe<T = unknown, R = any>(event: string, callback: EventCallback<T>, options?: SubscriptionOptions<T, R>): string;
  subscribeOnce<T = unknown, R = any>(event: string, callback: EventCallback<T>, options?: Omit<SubscriptionOptions<T, R>, 'once'>): string;
  unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void;
  unsubscribeById(id: string): void;
  publish<T = unknown>(event: string, args?: T, options?: PublishOptions | number): Promise<boolean>;
  use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void;
  removeMiddleware<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void;
  info(pattern?: string): EventInfo[];
  enableHistory(maxEvents?: number): void;
  disableHistory(): void;
  clearEventHistory(): void;
  getEventHistory<T = any>(pattern?: string): EventRecord<T>[];
}

interface CallbackInfo<T = unknown, R = any> {
  callback: EventCallback<T>;
  priority: number;
  transform?: TransformFunction<T, R>;
}

class EvEm implements IEventEmitter {
  private events = new Map<string, Map<string, CallbackInfo>>();
  private recursionDepth = new Map<string, number>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private throttleTimers = new Map<string, { timer: NodeJS.Timeout, expiresAt: number }>();
  private middleware: Array<{ pattern?: string; handler: MiddlewareFunction }> = [];
  private maxRecursionDepth: number;
  
  // Event history related properties
  private eventHistory: EventRecord[] = [];
  private historyEnabled: boolean = false;
  private historyMaxSize: number = 50; // Default history size

  constructor(maxRecursionDepth: number = 3) {
    this.maxRecursionDepth = maxRecursionDepth;
  }
  
  /**
   * Enable event history recording
   * @param maxEvents - Maximum number of events to store in history (default: 50)
   */
  enableHistory(maxEvents: number = 50): void {
    this.historyEnabled = true;
    this.historyMaxSize = maxEvents;
  }
  
  /**
   * Disable event history recording
   * Note: This doesn't clear existing history
   */
  disableHistory(): void {
    this.historyEnabled = false;
  }
  
  /**
   * Clear all recorded event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }
  
  /**
   * Get the recorded event history
   * @param pattern - Optional event pattern to filter history by
   * @returns Array of event records
   */
  getEventHistory<T = any>(pattern?: string): EventRecord<T>[] {
    if (!pattern) {
      return this.eventHistory as EventRecord<T>[];
    }
    
    // Filter history by pattern
    return this.eventHistory.filter(record => 
      this.isEventMatch(record.event, pattern)
    ) as EventRecord<T>[];
  }
  
  /**
   * Record an event in history if history is enabled
   * @param event - Event name
   * @param data - Event data
   */
  private recordEvent<T = any>(event: string, data: T): void {
    if (!this.historyEnabled) return;
    
    // Add to history with timestamp
    const record: EventRecord<T> = {
      event,
      data,
      timestamp: Date.now()
    };
    
    this.eventHistory.push(record);
    
    // Trim history if it exceeds the maximum size
    if (this.eventHistory.length > this.historyMaxSize) {
      this.eventHistory = this.eventHistory.slice(-this.historyMaxSize);
    }
  }
  
  /**
   * Register a middleware function to process events before they reach subscribers
   * @param middleware - The middleware function or config to add
   */
  use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
    if (typeof middleware === 'function') {
      // If just a function is provided, apply it to all events (no pattern)
      this.middleware.push({ handler: middleware as MiddlewareFunction });
    } else {
      // If a config object is provided, use its pattern and handler
      this.middleware.push({
        pattern: middleware.pattern,
        handler: middleware.handler as MiddlewareFunction
      });
    }
  }
  
  /**
   * Remove a previously registered middleware function
   * @param middleware - The middleware function or config to remove
   */
  removeMiddleware<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
    if (typeof middleware === 'function') {
      // Find and remove by handler function
      const index = this.middleware.findIndex(m => m.handler === middleware);
      if (index !== -1) {
        this.middleware.splice(index, 1);
      }
    } else {
      // Find and remove by handler and pattern
      const index = this.middleware.findIndex(m => 
        m.handler === middleware.handler && 
        m.pattern === middleware.pattern
      );
      if (index !== -1) {
        this.middleware.splice(index, 1);
      }
    }
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
  subscribe<T = unknown, R = any>(
    event: string, 
    callback: EventCallback<T>, 
    options?: SubscriptionOptions<T, R>
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
    
    // Capture the transform function if provided
    const transform = options?.transform;
    
    // Register the final wrapped callback with its priority and transform function
    const callbacks = this.events.get(event) ?? new Map();
    callbacks.set(subscriptionId, {
      callback: finalCallback as EventCallback,
      priority,
      transform
    });
    this.events.set(event, callbacks);
    
    // Handle history replay options if history is enabled
    if (this.historyEnabled && (options?.replayLastEvent || options?.replayHistory)) {
      // Get relevant historical events
      const relevantHistory = this.getEventHistory().filter(record => 
        this.isEventMatch(record.event, event)
      );
      
      if (relevantHistory.length > 0) {
        // If replayLastEvent is true, only replay the most recent event
        if (options?.replayLastEvent) {
          const lastEvent = relevantHistory[relevantHistory.length - 1];
          // Directly call the callback with the historical data
          try {
            finalCallback(lastEvent.data);
          } catch (error) {
            console.error(`Error replaying last event "${event}" to new subscriber:`, error);
          }
        } 
        // If replayHistory is true, replay all matching historical events in order
        else if (options?.replayHistory) {
          for (const record of relevantHistory) {
            try {
              finalCallback(record.data);
            } catch (error) {
              console.error(`Error replaying historical event "${event}" to new subscriber:`, error);
            }
          }
        }
      }
    }
    
    return subscriptionId;
  }
  
  /**
   * Subscribe to an event that will automatically unsubscribe after the first occurrence
   * @param event - The event name to subscribe to
   * @param callback - The callback to invoke when the event is published
   * @param options - Optional subscription options including filters, throttle, and debounce (except 'once')
   * @returns A subscription ID that can be used to unsubscribe before the event occurs
   */
  subscribeOnce<T = unknown, R = any>(
    event: string, 
    callback: EventCallback<T>, 
    options?: Omit<SubscriptionOptions<T, R>, 'once'>
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

  /**
   * Apply middleware to an event
   * @param event - The event name
   * @param data - The event data
   * @returns An object with potentially modified event and data, or null if the event was canceled
   */
  private async applyMiddleware<T = unknown>(event: string, data: T): Promise<{ event: string, data: T } | null> {
    let currentEvent = event;
    let currentData = data;
    
    // Apply each matching middleware in order
    for (const { pattern, handler } of this.middleware) {
      // Skip middleware that doesn't match the event pattern
      if (pattern && !this.isEventMatch(currentEvent, pattern)) {
        continue;
      }
      
      try {
        const result = handler(currentEvent, currentData);
        const processedResult = result instanceof Promise ? await result : result;
        
        // If middleware returns null, cancel the event
        if (processedResult === null) {
          return null;
        }
        
        // If middleware returns an object with event and data properties, update both
        if (processedResult && typeof processedResult === 'object' && 'event' in processedResult && 'data' in processedResult) {
          currentEvent = processedResult.event;
          currentData = processedResult.data;
        } 
        // Otherwise, just update the data
        else {
          currentData = processedResult as T;
        }
      } catch (error) {
        // Log the error and cancel the event
        console.error(`Error in middleware for event "${currentEvent}":`, error);
        return null;
      }
    }
    
    return { event: currentEvent, data: currentData };
  }

  async publish<T = unknown>(
    event: string, 
    args?: T, 
    options?: PublishOptions | number
  ): Promise<boolean> {
    if (!event) {
      return Promise.reject(new Error("Event name cannot be empty."));
    }

    // Handle different forms of options
    let timeout = 5000;
    let cancelable = false;
    let errorPolicy = ErrorPolicy.LOG_AND_CONTINUE;
    
    if (typeof options === 'number') {
      timeout = options;
    } else if (options) {
      timeout = options.timeout ?? 5000;
      cancelable = options.cancelable ?? false;
      errorPolicy = options.errorPolicy ?? ErrorPolicy.LOG_AND_CONTINUE;
    }

    this.incrementRecursionDepth(event);

    // Create event data (with or without cancel function)
    let eventData: any = args ?? ({} as T);
    let isCanceled = false;
    
    // Apply middleware to the event
    if (this.middleware.length > 0) {
      const middlewareResult = await this.applyMiddleware(event, eventData);
      
      // If middleware canceled the event, return false
      if (middlewareResult === null) {
        this.resetRecursionDepth(event);
        return false;
      }
      
      // Update event and data based on middleware result
      event = middlewareResult.event;
      eventData = middlewareResult.data;
    }
    
    // Add cancel functionality if the event is cancelable
    if (cancelable) {
      // Add the cancel method to the event data
      eventData = {
        ...eventData,
        cancel: function() {
          isCanceled = true;
        }
      };
    }
    
    // Record this event in history (before processing any callbacks)
    // We record the original data (without cancel method) to avoid circular references in history
    // and ensure that replayed events don't have cancel methods unless explicitly requested
    this.recordEvent(event, args ?? ({} as T));

    const matchingCallbacks: { callback: EventCallback, priority: number, transform?: TransformFunction }[] = [];

    // First, collect all matching callbacks with their priorities and transform functions
    for (const [registeredEvent, callbacks] of this.events) {
      if (this.isEventMatch(event, registeredEvent)) {
        for (const [_, cbInfo] of callbacks) {
          matchingCallbacks.push({
            callback: cbInfo.callback,
            priority: cbInfo.priority,
            transform: cbInfo.transform
          });
        }
      }
    }

    // Sort callbacks by priority (highest first)
    matchingCallbacks.sort((a, b) => b.priority - a.priority);

    // Execute callbacks in priority order - we need to handle them sequentially for cancellation
    let currentEventData = eventData; // Start with the initial event data
    
    for (const { callback, transform } of matchingCallbacks) {
      // Skip remaining callbacks if the event was canceled
      if (isCanceled) {
        break;
      }
      
      try {
        // Call the current callback with the current event data
        const callbackPromise = callback(currentEventData);
        if (callbackPromise instanceof Promise) {
          // For async callbacks, wait for them to complete before proceeding to the next one
          await this.handlePromiseWithTimeout(callbackPromise, timeout);
        }
        
        // Check if the event was canceled by the callback
        if (isCanceled) {
          break;
        }
        
        // Apply transformations if this callback has a transform function
        if (transform) {
          try {
            const transformResult = transform(currentEventData);
            if (transformResult instanceof Promise) {
              // For async transformations, wait for them to complete
              currentEventData = await this.handlePromiseWithTimeout(transformResult, timeout);
            } else {
              currentEventData = transformResult;
            }
          } catch (transformError) {
            // Handle transform error based on the error policy
            switch (errorPolicy) {
              case ErrorPolicy.SILENT:
                // Silently ignore the error - use original data for next callback
                break;
                
              case ErrorPolicy.CANCEL_ON_ERROR:
                // Log the error and cancel event propagation
                console.error(`Error in transform function for "${event}":`, transformError);
                isCanceled = true;
                break;
                
              case ErrorPolicy.THROW:
                // Rethrow the error to the caller
                this.resetRecursionDepth(event);
                throw transformError;
                
              case ErrorPolicy.LOG_AND_CONTINUE:
              default:
                // Log the error and continue with the next callback with original data
                console.error(`Error in transform function for "${event}":`, transformError);
                break;
            }
          }
        }
      } catch (error) {
        // Handle callback error based on the error policy
        switch (errorPolicy) {
          case ErrorPolicy.SILENT:
            // Silently ignore the error
            break;
            
          case ErrorPolicy.CANCEL_ON_ERROR:
            // Log the error and cancel event propagation
            console.error(`Error in event handler for "${event}":`, error);
            isCanceled = true;
            break;
            
          case ErrorPolicy.THROW:
            // Rethrow the error to the caller
            this.resetRecursionDepth(event);
            throw error;
            
          case ErrorPolicy.LOG_AND_CONTINUE:
          default:
            // Log the error and continue with the next callback (default behavior)
            console.error(`Error in event handler for "${event}":`, error);
            break;
        }
      }
    }

    this.resetRecursionDepth(event);
    
    // Return whether the event completed without being canceled
    return !isCanceled;
  }

  private async handlePromiseWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T | undefined> {
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<undefined>(resolve => {
      timeoutHandle = setTimeout(() => resolve(undefined), timeout);
    });

    try {
      // Race between the promise and the timeout
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle);
    }
    // Note: We don't catch errors here because we want them to propagate up
    // to the publish method where they will be handled according to the error policy
  }

  /**
   * Checks if an event name matches a pattern
   * @param event - The actual event name
   * @param pattern - The pattern to match against (can include wildcards)
   * @returns true if the event matches the pattern
   */
  private isEventMatch(event: string, pattern: string): boolean {
    // If pattern is a single wildcard, it matches everything
    if (pattern === '*') {
      return true;
    }
    
    const eventParts = event.split(".");
    const patternParts = pattern.split(".");
    
    // If pattern has more parts than the event, it can't match
    if (patternParts.length > eventParts.length) {
      return false;
    }
    
    // Special case for wildcard at end (e.g. "user.*")
    if (patternParts.length < eventParts.length && patternParts[patternParts.length - 1] === '*') {
      // Check all parts before the last one
      for (let i = 0; i < patternParts.length - 1; i++) {
        if (patternParts[i] !== '*' && patternParts[i] !== eventParts[i]) {
          return false;
        }
      }
      return true;
    }
    
    // If parts length is different but the last part isn't a wildcard, it can't match
    if (patternParts.length !== eventParts.length) {
      return false;
    }
    
    // Check each part
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== '*' && patternParts[i] !== eventParts[i]) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Get information about event subscriptions and middleware
   * @param pattern - Optional pattern to filter events and middleware
   * @returns Array of EventInfo objects describing subscriptions and middleware
   */
  info(pattern?: string): EventInfo[] {
    const result: EventInfo[] = [];
    
    // Add subscriptions matching the pattern
    for (const [event, callbacks] of this.events) {
      // If pattern is provided, check if the event matches
      if (pattern && !this.isEventMatch(event, pattern)) {
        continue;
      }
      
      // Add each subscription for this event
      for (const [id, callbackInfo] of callbacks) {
        result.push({
          event,
          isMiddleware: false,
          id,
          priority: callbackInfo.priority
        });
      }
    }
    
    // Add middleware matching the pattern
    for (const mw of this.middleware) {
      const middlewarePattern = mw.pattern || '*';
      
      // For middleware, we include it if:
      // 1. No pattern was provided (showing everything)
      // 2. The middleware's pattern matches the provided pattern
      // 3. The middleware has no pattern (matches all events) and a pattern was provided
      const shouldInclude = 
        !pattern || 
        this.isEventMatch(pattern, middlewarePattern) || 
        middlewarePattern === '*';
      
      if (shouldInclude) {
        result.push({
          event: middlewarePattern,
          isMiddleware: true,
          pattern: mw.pattern
        });
      }
    }
    
    return result;
  }
}

export { 
  EvEm,
  type IEventEmitter, 
  type EventCallback, 
  type FilterPredicate,
  type TransformFunction,
  type MiddlewareFunction,
  type MiddlewareResult,
  type MiddlewareConfig,
  type EventInfo,
  type EventRecord,
  type SubscriptionOptions,
  type PriorityLevel
};
