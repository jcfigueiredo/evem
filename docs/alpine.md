# Alpine.js Plugin

`@jcfigueiredo/evem/alpine` gives Alpine templates an EvEm instance:

- **`$evem.publish()`** publishes an event.
- **`$evem.on()`** subscribes until the element goes away.
- **`$store.evem`** (with the `sse` option) follows an `SseHandler`'s connection reactively.

The plugin doesn't import Alpine. You pass Alpine to it, so it adds no dependency and works with Alpine 3.

## Setup

```typescript
import Alpine from 'alpinejs';
import { EvEm } from '@jcfigueiredo/evem';
import { evemAlpine } from '@jcfigueiredo/evem/alpine';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm({ separator: ':' });
const sse = new SseHandler('/events/stream', evem, { readyEvent: 'keepalive', pageLifecycle: true });

Alpine.plugin(evemAlpine(evem, { sse }));   // before Alpine.start()
Alpine.start();
```

Use [the `':'` separator](guide/events.md#another-separator) if your event names also appear in Alpine attributes, so the same names work everywhere. The plugin's own calls take patterns as strings, so dots work there too.

## Publishing

```html
<button @click="$evem.publish('lane:expand', { lane: 'doing' })">Expand</button>
```

`$evem.publish(event, data?, options?)` is `evem.publish()`, and returns its promise.

## Subscribing

```html
<div x-data="{ tasks: [] }"
     x-init="$evem.on('server:task:*', task => tasks.push(task), { priority: 'high', filter: task => task.lane === 'doing' })">
  <template x-for="task in tasks"><p x-text="task.title"></p></template>
</div>
```

`$evem.on(pattern, callback, options?)` takes what `evem.subscribe()` takes: wildcards, priority, filters, throttle, debounce, once, replay.

**The subscription lasts as long as its element.** When Alpine removes the element (an htmx swap, `x-if`, `x-for`, or plain DOM removal), it unsubscribes. A component that's gone never keeps a listener. An element that idiomorph or Alpine's morph keeps and patches keeps its subscription, since its `x-init` doesn't run again.

To unsubscribe sooner, keep what `on` returns:

```html
<div x-data="{ sub: null, count: 0 }" x-init="sub = $evem.on('ping', () => count++)">
  <button @click="sub.unsubscribe()">Stop counting</button>
</div>
```

`on` returns `{ id, unsubscribe() }`, not an unsubscribe function: Alpine calls a function that an expression evaluates to, so `x-init="$evem.on(…)"` would unsubscribe at once.

`replayLastEvent` is handy in components that arrive late, such as after an htmx swap. With [history](guide/history-and-debugging.md) enabled, the component gets the latest state without asking the server again:

```html
<span x-data="{ count: 0 }" x-init="$evem.on('server:inbox:count', n => count = n, { replayLastEvent: true })" x-text="count"></span>
```

## The connection: `$store.evem`

With the `sse` option, `$store.evem` has:

| Field | Value |
|---|---|
| `state` | The handler's connection state: `'connecting'`, `'connected'`, `'reconnecting'`, `'disconnecting'` or `'disconnected'` |
| `ready` | `true` while the stream is live: open, and with `readyEvent`, after that event (see [Waiting until the stream is live](sse-adapter.md#waiting-until-the-stream-is-live)) |

```html
<div x-data x-show="!$store.evem.ready" class="alert">Reconnecting…</div>
<span x-data x-text="$store.evem.state"></span>
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `sse` | none | An `SseHandler` whose connection `$store.evem` follows. Without it, there's no store. |
| `magic` | `'evem'` | The magic's name: `$evem`. |
| `store` | `'evem'` | The store's name: `$store.evem`. |

## With the DOM bridge

The plugin and the [DOM bridge](dom.md) work together:
- **The plugin** gives templates EvEm's features directly: wildcards, priorities, element-scoped subscriptions.
- **The bridge** makes EvEm events ordinary DOM events, so existing `@event.window` listeners and htmx triggers keep working.

Use both while moving an app over.

## Coming

A development warning when `$evem.on`'s pattern matches no known event. It needs the list of event names at runtime, which comes with the typed event map (`docs/typed-events-design.md`).
