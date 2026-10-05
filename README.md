# EvEm 📢

A small TypeScript event emitter with wildcards, priorities, middleware, flow control, schema validation and history, plus optional WebSocket and Server-Sent Events adapters. No dependencies; ESM; Node.js 22+ and modern browsers.

**[Showcase](https://jcfigueiredo.github.io/evem/)** · **[Playground](https://jcfigueiredo.github.io/evem/playground/)** (try every feature against the real library) · [Documentation](https://github.com/jcfigueiredo/evem/blob/main/docs/README.md) · [Changelog](https://github.com/jcfigueiredo/evem/blob/main/CHANGELOG.md)

## Install

```bash
npm install @jcfigueiredo/evem
```

The core is the main entry point; each adapter has its own:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';
import { SseHandler } from '@jcfigueiredo/evem/sse';
import { formatSseMessage, SSE_HEADERS } from '@jcfigueiredo/evem/sse/server'; // for servers
```

## Quick start

```typescript
import { EvEm, type CancelableEvent } from '@jcfigueiredo/evem';

const evem = new EvEm();

// Subscribe and publish: the promise resolves once the subscribers have run
evem.subscribe<{ name: string }>('user.signup', (user) => console.log(`Welcome, ${user.name}!`));
await evem.publish('user.signup', { name: 'Ada' });
// Output: Welcome, Ada!

// Wildcards and priorities: 'user.*' matches user.signup, user.login, ...; higher priorities run first
evem.subscribe('user.*', () => console.log('audit: a user event'), { priority: 'high' });
await evem.publish('user.signup', { name: 'Bo' });
// Output:
// audit: a user event
// Welcome, Bo!

// Cancelable events: a subscriber can stop the ones after it
evem.subscribe<{ amount: number } & CancelableEvent>(
  'payment.charge',
  (payment) => {
    if (payment.amount > 1000) payment.cancel();
  },
  { priority: 'high' }
);
evem.subscribe<{ amount: number }>('payment.charge', (payment) => console.log(`Charged ${payment.amount}`));
console.log(await evem.publish('payment.charge', { amount: 5000 }, { cancelable: true }));
// Output: false
```

## Features

- **[Events](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/events.md)**: dot-separated names and wildcard patterns (`user.*`, `*.created`), priorities, once-only subscriptions, and cancelable events. Async subscribers are awaited one after the other, in priority order.
- **[Subscription options](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/subscriptions.md)**: filters (sync or async), throttle and debounce, transforms that pass changed data to the next subscribers, and schema validation.
- **[Middleware](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/middleware.md)**: see every event first, for all events or by pattern, to change its data, send it under another name, or cancel it.
- **[Errors, timeouts and recursion](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/errors.md)**: per-publish error policies, a timeout for each async subscriber, and a limit on events that re-publish themselves.
- **[History and debugging](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/history-and-debugging.md)**: record events and replay them to late subscribers, get a warning when subscriptions pile up, and inspect everything with `info()`.
- **Adapters**: connect EvEm to a server over [WebSocket](https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md) (offline queue, reconnection, request-response) or [Server-Sent Events](https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md) (auth headers, reconnection with backoff, resuming with `Last-Event-ID`), with helpers that write the stream on [JavaScript](https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md) and [Python](https://github.com/jcfigueiredo/evem/blob/main/docs/sse-python.md) servers.

## Adapters

Messages from the server arrive as EvEm events, under `server.*`:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();
const socket = new WebSocketHandler('wss://api.example.com', evem, { reconnect: true });

// { "event": "user.joined", "data": {...} } from the server is published as 'server.user.joined'
evem.subscribe<{ name: string }>('server.user.*', (user) => console.log('From the server:', user.name));

// Sent at once while connected; queued while not, and sent when the connection is back
await evem.publish('ws.send', { type: 'chat', text: 'Hello!' });
```

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
evem.subscribe<{ id: number }>('server.order.updated', (order) => console.log('Order updated:', order.id));

// Reconnects with backoff, and sends Last-Event-ID so the server can send what was missed
const stream = new SseHandler('https://api.example.com/events', evem, {
  headers: () => ({ Authorization: 'Bearer <token>' })
});
```

## Documentation

- **Guide**: [Events](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/events.md) · [Subscription options](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/subscriptions.md) · [Middleware](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/middleware.md) · [Errors, timeouts and recursion](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/errors.md) · [History and debugging](https://github.com/jcfigueiredo/evem/blob/main/docs/guide/history-and-debugging.md)
- **Reference**: [API](https://github.com/jcfigueiredo/evem/blob/main/docs/api.md) · [Examples](https://github.com/jcfigueiredo/evem/blob/main/docs/examples.md) · [Comparison with alternatives](https://github.com/jcfigueiredo/evem/blob/main/docs/comparison.md)
- **Adapters**: [WebSocket](https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md) · [Server events over WebSocket](https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-server-events.md) · [Server-Sent Events](https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md) · [SSE servers in Python](https://github.com/jcfigueiredo/evem/blob/main/docs/sse-python.md)

## Contributing

Issues and pull requests are welcome. [Working on EvEm](https://github.com/jcfigueiredo/evem/blob/main/docs/README.md#working-on-evem) lists the commands for tests, the demo site and releases.

## License

MIT. See [LICENSE](https://github.com/jcfigueiredo/evem/blob/main/LICENSE.md).
