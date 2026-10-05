import { generateId } from './id.js';

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

/** Result of handlePromiseWithTimeout when the timeout wins the race */
const TIMED_OUT = Symbol('timedOut');

/**
 * Returned by subscription wrappers (once, filters, schema, throttle/debounce) when they don't call
 * the subscriber for an event, so publish knows not to apply that subscriber's transform
 */
const SKIPPED = Symbol('skipped');

/** Callback as stored for a subscription: the user's callback wrapped by its options */
type WrappedCallback<T = unknown> = (args: T) => unknown;

/** Marks errors from schemaErrorPolicy THROW, which always reject publish */
const SCHEMA_THROW = Symbol('schemaThrow');

const isSchemaThrow = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[SCHEMA_THROW] === true;
/** A subscription's priority as a number: 'high' is 100, 'normal' 0, 'low' -100; numbers as they are */
function priorityValue(priority: number | PriorityLevel | Priority | undefined): number {
  if (typeof priority === 'number') return priority;
  return priority === 'high' ? 100 : priority === 'low' ? -100 : 0;
}

/** A publish's options, from either form: a number is the timeout */
function readPublishOptions(options: PublishOptions | number | undefined): {
  timeout: number;
  cancelable: boolean;
  errorPolicy: ErrorPolicy;
} {
  if (typeof options === 'number') {
    return { timeout: options, cancelable: false, errorPolicy: ErrorPolicy.LOG_AND_CONTINUE };
  }
  return {
    timeout: options?.timeout ?? 5000,
    cancelable: options?.cancelable ?? false,
    errorPolicy: options?.errorPolicy ?? ErrorPolicy.LOG_AND_CONTINUE
  };
}

/**
 * One publish while its subscribers run: its event (after middleware), options and publish chain, whether it was
 * canceled, and the data the next subscriber receives
 */
type PublishRun = {
  event: string;
  chain: Map<string, number>;
  timeout: number;
  cancelable: boolean;
  errorPolicy: ErrorPolicy;
  canceled: boolean;
  data: any;
};

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
  /** High priority handlers execute before normal and low priority handlers (100) */
  HIGH = 100
}

/**
 * Function to transform event data before it's passed to the next subscriber
 */
type TransformFunction<T = unknown, R = any> = (data: T) => R | Promise<R>;

/**
 * Schema validation function that validates event data against a schema
 * Returns true if valid, false if invalid
 */
export type SchemaValidator<T = unknown> = (data: T) => boolean | Promise<boolean>;

/**
 * Interface for schema validation error details
 */
export interface SchemaValidationError {
  /** The error message */
  message: string;
  /** The path to the invalid field (if available) */
  path?: string;
  /** Additional validation error details */
  details?: any;
}

/**
 * Advanced schema validator that returns validation errors
 */
export type AdvancedSchemaValidator<T = unknown> = (
  data: T
) =>
  { valid: boolean; errors?: SchemaValidationError[] } | Promise<{ valid: boolean; errors?: SchemaValidationError[] }>;

type SubscriptionOptions<T = unknown, R = any> = {
  filter?: FilterPredicate<T> | FilterPredicate<T>[];
  debounceTime?: number;
  throttleTime?: number;
  once?: boolean;
  priority?: number | PriorityLevel | Priority; // Can use numbers, strings, or Priority enum
  transform?: TransformFunction<T, R>; // Transform event data before passing to next subscriber
  replayLastEvent?: boolean; // Replay the most recent event on subscription
  replayHistory?: boolean; // Replay all historical events for this event pattern on subscription
  schema?: SchemaValidator<T> | AdvancedSchemaValidator<T>; // Schema validation for event data
  schemaErrorPolicy?: ErrorPolicy; // How to handle schema validation errors for this subscriber (default: ErrorPolicy.CANCEL_ON_ERROR, which skips only this subscriber)
};

/**
 * Result from a middleware function
 * - Return null to cancel the event
 * - Return the modified data to continue with the modified data
 * - Return a new object with exactly two properties, `event` (a string) and `data`, to change the
 *   event name and data. Returning the data unchanged, or a copy with extra properties, never
 *   reroutes, even if the payload itself has `event` and `data` fields.
 */
export type MiddlewareResult<T = any> = null | T | { event: string; data: T };

/**
 * Middleware function definition
 * @param event - The event name
 * @param data - The event data
 * @returns A MiddlewareResult that can modify or cancel the event
 */
export type MiddlewareFunction<T = any> = (
  event: string,
  data: T
) => MiddlewareResult<T> | Promise<MiddlewareResult<T>>;

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

/**
 * Information about an event subscription or middleware
 */
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
  subscribe<T = unknown, R = any>(
    event: string,
    callback: EventCallback<T>,
    options?: SubscriptionOptions<T, R>
  ): string;
  subscribeOnce<T = unknown, R = any>(
    event: string,
    callback: EventCallback<T>,
    options?: Omit<SubscriptionOptions<T, R>, 'once'>
  ): string;
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
  enableMemoryLeakDetection(options?: Partial<MemoryLeakOptions>): void;
  disableMemoryLeakDetection(): void;
}

interface CallbackInfo<T = unknown, R = any> {
  /** The callback wrapped with the subscription's options (once, filters, throttle, ...) */
  callback: WrappedCallback<T>;
  /** The callback as passed to subscribe, used by unsubscribe(event, callback) */
  originalCallback: EventCallback<T>;
  priority: number;
  /** Subscription order, used to break ties between equal priorities */
  sequence: number;
  transform?: TransformFunction<T, R>;
}

/**
 * Options for memory leak detection
 */
export interface MemoryLeakOptions {
  /** The threshold number of subscriptions to an event before showing a warning */
  threshold: number;
  /** Whether to automatically log subscription details when a leak is detected */
  showSubscriptionDetails: boolean;
}

class EvEm implements IEventEmitter {
  private events = new Map<string, Map<string, CallbackInfo>>();
  // Per-event depths of the publish chain whose handler is currently running.
  // A publish started from inside a handler inherits it; unrelated (concurrent) publishes start fresh.
  private activePublishChain: Map<string, number> | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private throttleTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; expiresAt: number }>();
  private middleware: Array<{ pattern?: string; handler: MiddlewareFunction }> = [];
  private subscriptionSequence = 0; // Orders subscriptions with equal priority by subscription time
  private maxRecursionDepth: number;

  // Event history related properties
  private eventHistory: EventRecord[] = [];
  private historyEnabled: boolean = false;
  private historyMaxSize: number = 50; // Default history size

  // Memory leak detection properties
  private memoryLeakDetectionEnabled: boolean = false;
  private memoryLeakThreshold: number = 10; // Default threshold
  private showLeakSubscriptionDetails: boolean = true; // Default to showing details
  private warnedEvents = new Set<string>(); // Track events we've already warned about

  constructor(maxRecursionDepth: number = 3) {
    this.maxRecursionDepth = maxRecursionDepth;
  }

  /**
   * Enable event history recording
   * @param maxEvents - Maximum number of events to store in history (default: 50)
   */
  enableHistory(maxEvents: number = 50): void {
    this.historyEnabled = true;
    this.historyMaxSize = Math.max(0, maxEvents);
    this.trimHistory();
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
   * Enable memory leak detection
   * @param options - Configuration options for leak detection
   */
  enableMemoryLeakDetection(options?: Partial<MemoryLeakOptions>): void {
    this.memoryLeakDetectionEnabled = true;

    if (options?.threshold !== undefined) {
      this.memoryLeakThreshold = options.threshold;
    }

    if (options?.showSubscriptionDetails !== undefined) {
      this.showLeakSubscriptionDetails = options.showSubscriptionDetails;
    }

    // Reset warnings when re-enabling
    this.warnedEvents.clear();
  }

  /**
   * Disable memory leak detection
   */
  disableMemoryLeakDetection(): void {
    this.memoryLeakDetectionEnabled = false;
    this.warnedEvents.clear();
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
    return this.eventHistory.filter(record => this.isEventMatch(record.event, pattern)) as EventRecord<T>[];
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
    this.trimHistory();
  }

  /**
   * Drop the oldest events so the history doesn't exceed its maximum size
   */
  private trimHistory(): void {
    const excess = this.eventHistory.length - this.historyMaxSize;
    if (excess > 0) {
      this.eventHistory.splice(0, excess);
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
      const index = this.middleware.findIndex(
        m => m.handler === middleware.handler && m.pattern === middleware.pattern
      );
      if (index !== -1) {
        this.middleware.splice(index, 1);
      }
    }
  }

  /**
   * Start a publish chain for an event, nested in the chain of the handler that is publishing it (if any)
   * @throws If the event is already nested maxRecursionDepth times in the current chain
   */
  private enterPublishChain(event: string): Map<string, number> {
    const parentChain = this.activePublishChain;
    const depth = (parentChain?.get(event) ?? 0) + 1;
    if (depth > this.maxRecursionDepth) {
      throw new Error(`Max recursion depth of ${this.maxRecursionDepth} exceeded for event '${event}'`);
    }
    const chain = new Map(parentChain ?? []);
    chain.set(event, depth);
    return chain;
  }

  /**
   * Run a handler with a publish chain active, so any publish it starts synchronously is counted as nested.
   * Publishes started after the handler's own awaits can't be attributed to the chain and start fresh.
   */
  private runInPublishChain<R>(chain: Map<string, number> | null, fn: () => R): R {
    const previousChain = this.activePublishChain;
    this.activePublishChain = chain;
    try {
      return fn();
    } finally {
      this.activePublishChain = previousChain;
    }
  }

  /**
   * Bind a continuation to the currently active publish chain, so internal async steps
   * (async filters and validators) still run the subscriber inside the chain that triggered it
   */
  private bindToActivePublishChain<A, R>(fn: (arg: A) => R): (arg: A) => R {
    const chain = this.activePublishChain;
    return (arg: A) => this.runInPublishChain(chain, () => fn(arg));
  }

  /**
   * Invoke a callback outside of a publish (debounced calls, history replay). There is no caller
   * to report errors to, so sync errors and async rejections are logged instead of escaping.
   */
  private invokeDetached<T>(callback: WrappedCallback<T>, args: T, errorMessage: string): void {
    try {
      const result = callback(args);
      if (result instanceof Promise) {
        result.catch(error => console.error(errorMessage, error));
      }
    } catch (error) {
      console.error(errorMessage, error);
    }
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
    if (!event) throw new Error('Event name cannot be empty.');

    // The once, throttle and debounce wrappers use the subscription's id
    const subscriptionId = generateId();

    // The callback chain, built from the inside out. Events flow through it in this order:
    // schema validation → filters → throttle/debounce → once → original callback.
    // Once is innermost, so only an event that got through every other step consumes it; filters wrap
    // throttle/debounce and once, so a rejected event never uses up a throttle window, resets a debounce
    // timer or consumes a once subscription
    let finalCallback: WrappedCallback<T> = callback;
    if (options?.once) finalCallback = this.onceWrapper(finalCallback, subscriptionId);
    finalCallback = this.flowControlWrapper(finalCallback, event, subscriptionId, options);
    if (options?.filter) finalCallback = this.filterWrapper(finalCallback, options.filter);
    if (options?.schema) {
      const policy = options.schemaErrorPolicy ?? ErrorPolicy.CANCEL_ON_ERROR;
      finalCallback = this.schemaWrapper(finalCallback, event, options.schema, policy);
    }

    const priority = priorityValue(options?.priority);
    const transform = options?.transform;

    // Register the final wrapped callback with its priority and transform function
    const callbacks = this.events.get(event) ?? new Map();
    callbacks.set(subscriptionId, {
      callback: finalCallback as WrappedCallback,
      originalCallback: callback as EventCallback,
      priority,
      sequence: this.subscriptionSequence++,
      transform
    });
    this.events.set(event, callbacks);

    // Check for potential memory leaks if detection is enabled
    if (this.memoryLeakDetectionEnabled && callbacks.size > this.memoryLeakThreshold) {
      this.checkForMemoryLeak(event, callbacks.size);
    }

    if (this.historyEnabled && (options?.replayLastEvent || options?.replayHistory)) {
      this.replayHistoryTo(finalCallback, event, options.replayLastEvent ? 'last' : 'all');
    }

    return subscriptionId;
  }

  /**
   * Once: the callback runs for the first event that reaches it. The subscription goes just before it runs, so it
   * goes even if the callback throws or never settles; the flag makes it fire exactly once even when events arrive
   * concurrently or are replayed from history.
   */
  private onceWrapper<T>(callback: WrappedCallback<T>, subscriptionId: string): WrappedCallback<T> {
    let hasFired = false;
    // Named, like the other steps' wrappers, so stack traces show which step a frame is
    const onceWrapper = (args: T) => {
      if (hasFired) {
        return SKIPPED;
      }
      hasFired = true;
      this.unsubscribeById(subscriptionId);
      return callback(args);
    };
    return onceWrapper;
  }

  /** Throttle, debounce, both, or neither (a time that isn't positive is no time) */
  private flowControlWrapper<T>(
    callback: WrappedCallback<T>,
    event: string,
    subscriptionId: string,
    options?: SubscriptionOptions<T, any>
  ): WrappedCallback<T> {
    const throttleTime = options?.throttleTime && options.throttleTime > 0 ? options.throttleTime : 0;
    const debounceTime = options?.debounceTime && options.debounceTime > 0 ? options.debounceTime : 0;
    if (throttleTime && debounceTime) {
      return this.throttleDebounceWrapper(callback, event, subscriptionId, throttleTime, debounceTime);
    }
    if (throttleTime) return this.throttleWrapper(callback, event, subscriptionId, throttleTime);
    if (debounceTime) return this.debounceWrapper(callback, event, subscriptionId, debounceTime);
    return callback;
  }

  /** Throttle: the first event runs at once and opens a window; events during the window are dropped */
  private throttleWrapper<T>(
    callback: WrappedCallback<T>,
    event: string,
    subscriptionId: string,
    throttleTime: number
  ): WrappedCallback<T> {
    return (args: T) => {
      const timerId = `throttle_${event}_${subscriptionId}`;
      const now = Date.now();

      // Check if we're currently throttled
      if (this.throttleTimers.has(timerId)) {
        const throttleData = this.throttleTimers.get(timerId)!;

        // If throttle window hasn't expired, ignore this event
        if (now < throttleData.expiresAt) {
          return SKIPPED;
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
      return callback(args);
    };
  }

  /** Debounce: each event restarts a timer, and the callback runs with the last event once they pause */
  private debounceWrapper<T>(
    callback: WrappedCallback<T>,
    event: string,
    subscriptionId: string,
    debounceTime: number
  ): WrappedCallback<T> {
    return (args: T) => {
      const timerId = `debounce_${event}_${subscriptionId}`;
      this.clearDebounce(timerId);
      return this.scheduleDebounce(timerId, callback, args, event, debounceTime);
    };
  }

  /** Cancel a debounced call that hasn't run yet, if there is one */
  private clearDebounce(timerId: string): void {
    if (this.debounceTimers.has(timerId)) {
      clearTimeout(this.debounceTimers.get(timerId));
    }
  }

  /**
   * Run the callback with `args` after `debounceTime`, unless another event restarts the timer first. It runs
   * detached: there's no publish to report its errors to anymore, so they're logged. The publish skips it for now.
   */
  private scheduleDebounce<T>(
    timerId: string,
    callback: WrappedCallback<T>,
    args: T,
    event: string,
    debounceTime: number
  ): typeof SKIPPED {
    const timer = setTimeout(() => {
      this.debounceTimers.delete(timerId);
      this.invokeDetached(callback, args, `Error in debounced handler for "${event}":`);
    }, debounceTime);
    this.debounceTimers.set(timerId, timer);
    return SKIPPED;
  }

  /**
   * Throttle and debounce: an event runs at once when more than throttleTime has passed since the last immediate
   * run; the others are debounced, so the last event still gets a run
   */
  private throttleDebounceWrapper<T>(
    callback: WrappedCallback<T>,
    event: string,
    subscriptionId: string,
    throttleTime: number,
    debounceTime: number
  ): WrappedCallback<T> {
    // Track the last throttled time
    const throttleState = { lastThrottledTime: 0 };

    return (args: T) => {
      const timerId = `combined_${event}_${subscriptionId}`;
      const now = Date.now();

      // Check if throttling allows this event to pass through
      let shouldProcessNow = false;

      // If no throttle window or it has expired, we can process immediately
      if (now - throttleState.lastThrottledTime > throttleTime) {
        throttleState.lastThrottledTime = now;
        shouldProcessNow = true;
      }

      // A pending debounced call is replaced, whether this event runs now or later
      this.clearDebounce(timerId);

      // If it should process now due to throttle, do it immediately; otherwise, debounce it
      if (shouldProcessNow) {
        return callback(args);
      }
      return this.scheduleDebounce(timerId, callback, args, event, debounceTime);
    };
  }

  /**
   * Filters: run in series, stop at the first that says no, and must all pass; one that throws is logged and
   * counts as a no. The answer is always a promise (they may be async), so the callback runs in the publish chain
   * it was called in (bindToActivePublishChain).
   */
  private filterWrapper<T>(
    callback: WrappedCallback<T>,
    filter: FilterPredicate<T> | FilterPredicate<T>[]
  ): WrappedCallback<T> {
    const filters = Array.isArray(filter) ? filter : [filter];
    const checkFilters = async (args: T): Promise<boolean> => {
      for (const each of filters) {
        try {
          const result = each(args);
          const passes = result instanceof Promise ? await result : result;
          if (!passes) return false;
        } catch (error) {
          console.error('Filter threw an error:', error);
          return false;
        }
      }
      return true;
    };
    const filterWrapper = (args: T) =>
      checkFilters(args).then(this.bindToActivePublishChain(passes => (passes ? callback(args) : SKIPPED)));
    return filterWrapper;
  }

  /**
   * Schema validation: valid data reaches the callback; invalid data, or a validator that throws or rejects, goes
   * to the subscriber's schemaErrorPolicy (see onSchemaFailure). Only errors thrown by the validator itself are
   * schema errors; the callback's own errors reach the publish error policy, so it runs outside the validator's try.
   */
  private schemaWrapper<T>(
    callback: WrappedCallback<T>,
    event: string,
    validator: SchemaValidator<T> | AdvancedSchemaValidator<T>,
    policy: ErrorPolicy
  ): WrappedCallback<T> {
    const schemaValidationWrapper = (args: T) => {
      const failed = (message: string, errors: SchemaValidationError[] | null) =>
        this.onSchemaFailure(message, policy, errors, () => callback(args));

      // Works for both simple (boolean) and advanced ({ valid, errors }) validator results
      const handleValidationResult = (result: boolean | { valid: boolean; errors?: SchemaValidationError[] }) => {
        const isSimpleResult = typeof result === 'boolean';
        const valid = isSimpleResult ? result : result.valid;
        if (valid) {
          return callback(args);
        }
        return failed(`Schema validation failed for event '${event}'`, isSimpleResult ? null : (result.errors ?? null));
      };
      const handleValidatorError = (error: unknown) =>
        failed(
          `Error during schema validation for event '${event}': ${String(error)}`,
          error instanceof Error ? [{ message: error.message }] : null
        );

      let validationResult: ReturnType<typeof validator>;
      try {
        validationResult = validator(args);
      } catch (error) {
        return handleValidatorError(error);
      }

      // Handle both synchronous and asynchronous validators
      if (validationResult instanceof Promise) {
        return validationResult.then(
          this.bindToActivePublishChain(handleValidationResult),
          this.bindToActivePublishChain(handleValidatorError)
        );
      }
      return handleValidationResult(validationResult);
    };
    return schemaValidationWrapper;
  }

  /**
   * What failed validation does, by the subscriber's schemaErrorPolicy: SILENT skips the subscriber,
   * LOG_AND_CONTINUE logs and runs it anyway (`run`), THROW rejects the publish (marked with SCHEMA_THROW, so the
   * publish error policy can't swallow it), and CANCEL_ON_ERROR (the default) logs and skips this subscriber only
   */
  private onSchemaFailure(
    message: string,
    policy: ErrorPolicy,
    errors: SchemaValidationError[] | null,
    run: () => unknown
  ): unknown {
    switch (policy) {
      case ErrorPolicy.SILENT:
        return SKIPPED;

      case ErrorPolicy.LOG_AND_CONTINUE:
        console.error(message, errors ? errors : '');
        return run();

      case ErrorPolicy.THROW: {
        const error = new Error(message);
        (error as any).validationErrors = errors;
        Object.defineProperty(error, SCHEMA_THROW, { value: true });
        throw error;
      }

      case ErrorPolicy.CANCEL_ON_ERROR:
      default:
        console.error(message, errors ? errors : '');
        return SKIPPED;
    }
  }

  /** History replay for a new subscriber: its event's latest record (`last`), or all of them, in order (`all`) */
  private replayHistoryTo<T>(callback: WrappedCallback<T>, event: string, which: 'last' | 'all'): void {
    const relevantHistory = this.getEventHistory().filter(record => this.isEventMatch(record.event, event));
    if (relevantHistory.length === 0) return;

    if (which === 'last') {
      const lastEvent = relevantHistory[relevantHistory.length - 1]!;
      this.invokeDetached(callback, lastEvent.data, `Error replaying last event "${event}" to new subscriber:`);
      return;
    }
    for (const record of relevantHistory) {
      this.invokeDetached(callback, record.data, `Error replaying historical event "${event}" to new subscriber:`);
    }
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
      // Match the callback passed to subscribe: the stored one is wrapped when options were used
      if (cbInfo.originalCallback === callback) {
        this.removeSubscription(event, callbacks, id);
        break;
      }
    }
  }

  unsubscribeById(id: string): void {
    if (!id) throw new Error("You can't unsubscribe to an event with an empty id.");

    // Find and remove the callback
    for (const [event, callbacks] of this.events) {
      if (callbacks.has(id)) {
        this.removeSubscription(event, callbacks, id);
        break;
      }
    }
  }

  /**
   * Remove a subscription and clean up its leak warning and pending throttle/debounce timers
   */
  private removeSubscription(event: string, callbacks: Map<string, CallbackInfo>, id: string): void {
    callbacks.delete(id);
    if (callbacks.size === 0) {
      this.events.delete(event);
    }

    // Clear memory leak warning if subscription count falls below threshold
    if (this.memoryLeakDetectionEnabled && this.warnedEvents.has(event) && callbacks.size <= this.memoryLeakThreshold) {
      this.warnedEvents.delete(event);
    }

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
  }

  /**
   * Apply middleware to an event
   * @param event - The event name
   * @param data - The event data
   * @param publishChain - The publish chain to run middleware in (for recursion detection)
   * @returns An object with potentially modified event and data, or null if the event was canceled
   */
  private async applyMiddleware<T = unknown>(
    event: string,
    data: T,
    publishChain: Map<string, number>
  ): Promise<{ event: string; data: T } | null> {
    let currentEvent = event;
    let currentData = data;

    // Apply each matching middleware in order
    for (const { pattern, handler } of this.middleware) {
      // Skip middleware that doesn't match the event pattern
      if (pattern && !this.isEventMatch(currentEvent, pattern)) {
        continue;
      }

      try {
        const result = this.runInPublishChain(publishChain, () => handler(currentEvent, currentData));
        const processedResult = result instanceof Promise ? await result : result;

        // If middleware returns null, cancel the event
        if (processedResult === null) {
          return null;
        }

        // If middleware returns a new { event, data } object, update both.
        // Data returned unchanged (or enriched) is never a reroute, even if the payload
        // itself happens to have `event` and `data` fields (e.g. WebSocket messages).
        if (processedResult !== currentData && this.isMiddlewareReroute(processedResult)) {
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

  /**
   * Give the data of a cancelable event a cancel() method and a read-only `canceled` flag.
   * Plain objects are copied (as before). Arrays are copied too and stay arrays. Other objects
   * (Date, Map, class instances) can't be copied faithfully, so they're wrapped in a Proxy that
   * keeps their type and methods. Primitives can't carry a method and are returned unchanged.
   */
  private addCancelSupport(data: unknown, cancel: () => void, isCanceled: () => boolean): unknown {
    if (data === null || typeof data !== 'object') {
      return data;
    }

    const prototype = Object.getPrototypeOf(data);
    if (Array.isArray(data) || prototype === Object.prototype || prototype === null) {
      const copy: any = Array.isArray(data) ? [...data] : { ...data };
      if (Array.isArray(data)) {
        Object.defineProperty(copy, 'cancel', { value: cancel, configurable: true, writable: true });
      } else {
        copy.cancel = cancel;
      }
      Object.defineProperty(copy, 'canceled', { get: isCanceled, configurable: true });
      return copy;
    }

    return new Proxy(data, {
      get(target, property) {
        if (property === 'cancel') return cancel;
        if (property === 'canceled') return isCanceled();
        const value = Reflect.get(target, property, target);
        // Bind methods to the real object: built-ins like Date and Map need their internal slots
        return typeof value === 'function' ? value.bind(target) : value;
      },
      has(target, property) {
        return property === 'cancel' || property === 'canceled' || Reflect.has(target, property);
      }
    });
  }

  /**
   * Checks if a middleware result is a reroute: an object with exactly `event` (a string) and `data`
   */
  private isMiddlewareReroute(result: unknown): result is { event: string; data: any } {
    if (!result || typeof result !== 'object') {
      return false;
    }
    const keys = Object.keys(result);
    return keys.length === 2 && 'event' in result && 'data' in result && typeof result.event === 'string';
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- the subscriber loop stays here so only promises are awaited (see the comment in it)
  async publish<T = unknown>(event: string, args?: T, options?: PublishOptions | number): Promise<boolean> {
    if (!event) {
      return Promise.reject(new Error('Event name cannot be empty.'));
    }
    const { timeout, cancelable, errorPolicy } = readPublishOptions(options);

    // Track nesting for recursion detection (throws if this event is nested too deeply)
    const chain = this.enterPublishChain(event);

    // Only a missing payload defaults to {}
    let data: any = args === undefined ? ({} as T) : args;

    // Middleware can cancel the event (null), change its data, or reroute it
    if (this.middleware.length > 0) {
      const middlewareResult = await this.applyMiddleware(event, data, chain);
      if (middlewareResult === null) {
        return false;
      }
      event = middlewareResult.event;
      data = middlewareResult.data;
    }

    // Record this event in history (before processing any callbacks), with the data subscribers receive after
    // middleware, but before the cancel method is added, so that replayed events don't have cancel methods
    this.recordEvent(event, data);

    const run: PublishRun = { event, chain, timeout, cancelable, errorPolicy, canceled: false, data };
    if (cancelable) {
      run.data = this.withCancelSupport(run, data);
    }

    // Subscribers run one after the other, in priority order, until one cancels the event. Only what returns a
    // promise is awaited, so synchronous subscribers all run before publish returns
    for (const { callback, transform } of this.matchingSubscribers(event)) {
      if (run.canceled) {
        break;
      }
      try {
        let outcome = this.runInPublishChain(chain, () => callback(run.data));
        if (outcome instanceof Promise) {
          // A timeout is an error for the error policy; the callback itself keeps running
          outcome = await this.handlePromiseWithTimeout(outcome, timeout);
          if (outcome === TIMED_OUT) {
            throw new Error(`Event handler timed out after ${timeout}ms`);
          }
        }
        // The callback may have canceled the event; a skipped one (once, filter, schema, throttle or debounce)
        // doesn't transform the data
        if (run.canceled) {
          break;
        }
        if (transform && outcome !== SKIPPED) {
          // An async transform is awaited here, as the callback is, so the next subscriber runs as soon as it settles
          const transforming = this.applyTransform(transform, run);
          if (transforming) {
            // eslint-disable-next-line max-depth -- an async transform's errors are the transform's (see publish)
            try {
              this.settleTransform(await transforming, run);
            } catch (error) {
              this.onPublishError(error, run, 'transform function');
            }
          }
        }
      } catch (error) {
        this.onPublishError(error, run, 'event handler');
      }
    }

    // Return whether the event completed without being canceled
    return !run.canceled;
  }

  /** The subscriptions whose pattern matches `event`, highest priority first, then in the order they subscribed */
  private matchingSubscribers(event: string): CallbackInfo[] {
    const matching: CallbackInfo[] = [];
    for (const [registeredEvent, callbacks] of this.events) {
      if (this.isEventMatch(event, registeredEvent)) {
        for (const subscriber of callbacks.values()) matching.push(subscriber);
      }
    }
    return matching.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  }

  /** The data with cancel() and `canceled`, which cancel this publish run */
  private withCancelSupport(run: PublishRun, data: any): any {
    return this.addCancelSupport(
      data,
      () => {
        run.canceled = true;
      },
      () => run.canceled
    );
  }

  /**
   * A subscriber's transform: a synchronous result becomes the data the next subscribers receive at once; an async
   * one is returned, raced against the publish timeout, for publish to await and pass to settleTransform. Its errors
   * go through the error policy, so with its go-ahead the next subscriber gets the data from before the transform;
   * THROW rethrows to publish.
   */
  private applyTransform(transform: TransformFunction, run: PublishRun): Promise<unknown> | undefined {
    let result: unknown;
    try {
      result = this.runInPublishChain(run.chain, () => transform(run.data));
    } catch (error) {
      this.onPublishError(error, run, 'transform function');
      return undefined;
    }
    if (result instanceof Promise) {
      return this.handlePromiseWithTimeout(result, run.timeout);
    }
    this.settleTransform(result, run);
    return undefined;
  }

  /** A transform's result becomes the data (cancelable again if the event is); a timeout is an error */
  private settleTransform(result: unknown, run: PublishRun): void {
    if (result === TIMED_OUT) {
      throw new Error(`Transform timed out after ${run.timeout}ms`);
    }
    run.data = run.cancelable ? this.withCancelSupport(run, result) : result;
  }

  /**
   * A callback's or a transform's error, by the publish error policy: SILENT ignores it, LOG_AND_CONTINUE logs it
   * and goes on, CANCEL_ON_ERROR logs it and stops the event, THROW rejects the publish. A callback's schema error
   * with schemaErrorPolicy THROW always rejects, whatever the policy.
   */
  private onPublishError(error: unknown, run: PublishRun, what: 'event handler' | 'transform function'): void {
    if (what === 'event handler' && isSchemaThrow(error)) {
      throw error;
    }
    switch (run.errorPolicy) {
      case ErrorPolicy.SILENT:
        break;

      case ErrorPolicy.CANCEL_ON_ERROR:
        console.error(`Error in ${what} for "${run.event}":`, error);
        run.canceled = true;
        break;

      case ErrorPolicy.THROW:
        throw error;

      case ErrorPolicy.LOG_AND_CONTINUE:
      default:
        console.error(`Error in ${what} for "${run.event}":`, error);
        break;
    }
  }

  private async handlePromiseWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T | typeof TIMED_OUT> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<typeof TIMED_OUT>(resolve => {
      timeoutHandle = setTimeout(() => resolve(TIMED_OUT), timeout);
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

    const eventParts = event.split('.');
    const patternParts = pattern.split('.');

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
   * Check for potential memory leaks when the number of subscriptions exceeds the threshold
   * @param event - The event name
   * @param count - The current number of subscriptions
   */
  private checkForMemoryLeak(event: string, count: number): void {
    // Only warn once per event to avoid console spam
    if (this.warnedEvents.has(event)) {
      return;
    }

    // Mark this event as warned
    this.warnedEvents.add(event);

    // Format the warning message
    console.warn(
      `Possible memory leak detected: ${count} handlers added for event "${event}". ` +
        `This exceeds the threshold of ${this.memoryLeakThreshold}. ` +
        'This could indicate event handlers are not being properly unsubscribed.'
    );

    // Show subscription details if enabled
    if (this.showLeakSubscriptionDetails) {
      console.group('Event subscription details:');

      try {
        // The subscriptions the warning counted: those to this exact event name or pattern
        const subscriptions = this.events.get(event) ?? new Map<string, CallbackInfo>();

        console.log(`Subscriptions to "${event}": ${subscriptions.size}`);
        console.log('Subscription IDs:');

        subscriptions.forEach((info, id) => {
          console.log(`- ${id} (priority: ${info.priority})`);
        });

        console.log('To fix this issue:');
        console.log('1. Ensure all event handlers are unsubscribed when components are unmounted');
        console.log('2. Use subscribeOnce() for one-time events');
        console.log(`3. Increase the threshold if ${this.memoryLeakThreshold} is too low for your application`);
      } catch (error) {
        console.error('Error displaying subscription details:', error);
      }

      console.groupEnd();
    }
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
      const shouldInclude = !pattern || this.isEventMatch(pattern, middlewarePattern) || middlewarePattern === '*';

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

// Types declared with `export` above are already exported; only list the rest here
export {
  EvEm,
  type IEventEmitter,
  type EventCallback,
  type FilterPredicate,
  type TransformFunction,
  type SubscriptionOptions,
  type PriorityLevel
};
