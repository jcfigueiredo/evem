# EvEm documentation

## Guide

- [Events](guide/events.md): how an event is processed, wildcards, priorities, once-only subscriptions and cancelable events
- [Subscription options](guide/subscriptions.md): filters, throttle, debounce, transforms and schema validation
- [Middleware](guide/middleware.md): change, reroute or cancel events before any subscriber sees them
- [Errors, timeouts and recursion](guide/errors.md): error policies, timeouts for async subscribers, recursion protection
- [History and debugging](guide/history-and-debugging.md): history and replay, memory-leak warnings, `info()`

## Reference

- [API](api.md): every method and option
- [Examples](examples.md): longer examples of the features together
- [Comparison with alternatives](comparison.md): Node's EventEmitter, EventEmitter3, mitt, RxJS and others, with when to pick each

## Adapters

- [WebSocket adapter](websocket-adapter.md): `WebSocketHandler`, the offline queue, reconnection, request-response, and the full event reference
- [Server events over WebSocket](websocket-server-events.md): the message format servers send, with examples
- [Server-Sent Events adapter](sse-adapter.md): `SseHandler`, its transports, reconnection, resuming, heartbeats, backpressure, and the server helpers
- [SSE servers in Python](sse-python.md): a copy-in helper for the standard library, FastAPI and Flask

## Working on EvEm

```bash
pnpm test            # Watch mode
pnpm test:nowatch    # Run once
pnpm test:coverage   # Run once with a coverage report (a summary, and HTML in coverage/)
pnpm typecheck       # TypeScript check
pnpm lint            # Complexity and repeated code (ESLint)
pnpm duplication     # Code duplicated between files (jscpd)
pnpm format          # Format the code with Prettier (pnpm format:check only checks)
pnpm check           # Everything CI runs: format check, lint, duplication, type check, tests and package check
pnpm demo            # The demo site (showcase and playground) on a local dev server
pnpm demo:build      # Build the demo site into demo/dist/
```

Developing needs Node.js 20.19+ or 22.13+ (the demo site is built with Vite 8, and the tests build it; ESLint 10 needs 22.13 on Node 22); the package itself runs on Node.js 20+.

Maintainers release new versions with `pnpm release <version>`; see [Releasing](releasing.md).

Design notes, for contributors: [the SSE adapter's design](sse-adapter-design.md), [WebSocket features proposal](websocket-features-proposal.md) and [the demo site revamp](demo-revamp-design.md).

## Planned

1. **Subscription lifecycle hooks**: hooks for subscription creation and teardown, useful for cleanup.
2. **Performance metrics and telemetry**: built-in instrumentation for measuring event processing.
