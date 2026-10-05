# Comparison with alternatives

Here's how EvEm compares to other popular event emitter libraries. EvEm is written in TypeScript and ships its own type declarations. With a [typed event map](guide/typed-events.md) (`new EvEm<AppEvents>()`), the compiler checks every name and payload, wildcard subscriptions included: a pattern that matches no event is an error. Without one, you type payloads per subscription and publish (`subscribe<T>`, `publish<T>`).

## EvEm vs Node.js EventEmitter

**Pros of EvEm:**
- Namespace and wildcard pattern support
- Async callbacks are awaited in priority order, with timeouts
- Priorities, filters, middleware, throttle/debounce, schema validation and history built in
- Recursion depth limit for events that re-publish themselves
- Runs in browsers as well as Node.js

**Cons of EvEm:**
- Not as widely adopted as Node's EventEmitter
- An extra package (with no dependencies of its own), whereas Node's EventEmitter is built in
- `publish` always returns a promise, while `emit` is synchronous

## EvEm vs EventEmitter3

**Pros of EvEm:**
- Namespace hierarchy support
- Wildcard event pattern matching
- Built-in handling of async callbacks, with timeouts
- Priorities, filters, middleware and history built in

**Cons of EvEm:**
- EventEmitter3 is focused on raw performance, which EvEm doesn't match
- Smaller community and ecosystem

## EvEm vs Mitt

**Pros of EvEm:**
- More feature-rich (wildcard patterns, priorities, middleware, history)
- Awaits async callbacks, with timeouts and error policies
- Subscription ID tracking for easier unsubscription
- Recursion depth control

**Cons of EvEm:**
- Larger bundle size than Mitt (which is ~200 bytes)
- More complex API compared to Mitt's minimalist approach

## EvEm vs RxJS

**Pros of EvEm:**
- Simpler learning curve
- Smaller bundle size
- Focused functionality for pub/sub patterns
- Less conceptual overhead

**Cons of EvEm:**
- Lacks reactive programming features such as composable operators over streams
- Less powerful for complex async workflows

## EvEm vs tiny-emitter

**Pros of EvEm:**
- Written in TypeScript
- More features (namespaces, wildcards, async handling)
- Configurable error policies
- Subscription ID system

**Cons of EvEm:**
- Larger size compared to tiny-emitter's minimal footprint
- More complex implementation

## EvEm vs events (browserify)

**Pros of EvEm:**
- Modern TypeScript implementation
- Namespaces and wildcards not available in events
- Timeout handling for async callbacks

**Cons of EvEm:**
- Not a direct drop-in replacement for Node.js code
- Less community adoption
