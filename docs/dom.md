# DOM Bridge

`@jcfigueiredo/evem/dom` connects EvEm to DOM events, so code that listens with `addEventListener`, Alpine's `@event.window` or htmx's `hx-trigger="… from:window"` gets EvEm events, and EvEm subscribers get what such code dispatches. It needs no framework and has no dependencies.

- **`bridgeToDom(evem, patterns, options?)`**: every EvEm event the patterns match is dispatched as a `CustomEvent` with the data as `detail`.
- **`bridgeFromDom(evem, names, options?)`**: every DOM event with one of these names is published in EvEm, with its `detail` as data.

Both return a function that stops the bridge.

## EvEm to the DOM

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { bridgeToDom } from '@jcfigueiredo/evem/dom';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm({ separator: ':' });
new SseHandler('/events/stream', evem, { readyEvent: 'keepalive' });

// Server events and toasts reach DOM listeners on window
const stop = bridgeToDom(evem, ['server:*', 'toast']);
```

Then, in templates:

```html
<!-- Alpine -->
<div x-data="{ open: false }" @server:task-changed.window="open = $event.detail.id === taskId">

<!-- htmx: reload the lane when one of its tasks changes -->
<div hx-get="/board/lane/doing" hx-trigger="server:task-changed[detail.lane=='doing'] from:window delay:300ms">
```

Choose [another separator](guide/events.md#another-separator) such as `':'` when the names appear in Alpine attributes. Alpine reads dots as modifiers: `@server.task-changed.window` listens to `server`. If you keep dots, rename the events for the DOM:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { bridgeToDom } from '@jcfigueiredo/evem/dom';

const evem = new EvEm();
bridgeToDom(evem, 'server.*', { rename: (name) => name.replaceAll('.', ':') });
```

The bridge is a middleware:

- **What it sends:** each event as earlier middleware left it (changed data, a new name after a reroute). Events they canceled are never sent.
- **When it sends:** before EvEm subscribers run.
- **Where to register it:** after middleware that changes or cancels events.

The `detail` is the data as published, without the `cancel()` of [cancelable events](guide/events.md#using-cancelable-events). DOM listeners can't cancel an EvEm event, and they run in the order they were added, not by EvEm priority.

## The DOM to EvEm

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { bridgeFromDom } from '@jcfigueiredo/evem/dom';

const evem = new EvEm({ separator: ':' });

// Alpine's $dispatch('lane:expand', { lane: 'doing' }) bubbles up to window
bridgeFromDom(evem, ['lane:expand', 'lane:collapse']);

evem.subscribe('lane:*', ({ lane }: { lane: string }) => console.log('lane', lane));
```

A publish that rejects (a subscriber with `schemaErrorPolicy: THROW`, the recursion limit) is logged with `console.error`. There's nobody to hand the error to.

## Both ways

A name can be bridged in both directions: one bus for TypeScript and templates.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { bridgeFromDom, bridgeToDom } from '@jcfigueiredo/evem/dom';

const evem = new EvEm();
bridgeToDom(evem, 'toast');
bridgeFromDom(evem, 'toast');

// Both reach EvEm subscribers once and DOM listeners once:
await evem.publish('toast', { message: 'Saved' }); // from code
// $dispatch('toast', { message: 'Saved' })        // from a template
```

There's no loop:
- the events `bridgeToDom` dispatches are never brought back into EvEm;
- while an event that came from the DOM is being published, `bridgeToDom` doesn't send that name back to the DOM.

**Limit:** while such a publish is still running, another publish of the same name made from elsewhere isn't sent to the DOM either. A subscriber that awaits something keeps the publish running.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `target` | the global `window` | The `EventTarget` to dispatch on or listen to. Outside browsers there's no default: pass one, or the call throws a `TypeError`. |
| `rename` | none | The name on the other side: `(name) => string`, from the EvEm name to the DOM name for `bridgeToDom`, and the reverse for `bridgeFromDom`. |

Events dispatched on `window` don't bubble, which is what `@….window` and `from:window` expect. For htmx's `from:body` or `from:document`, bridge with `target: document.body` or `target: document`.
