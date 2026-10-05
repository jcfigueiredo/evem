# Typed Events

Give an emitter an event map, and TypeScript checks every name and payload:

- a misspelled event;
- a listener whose pattern matches nothing;
- a payload of the wrong shape.

All three become compile errors instead of events that silently go nowhere. Without a map, nothing changes.

## An event map

```typescript
import { EvEm, type Cancelable } from '@jcfigueiredo/evem';

interface Task { id: string; lane: string; title: string }

interface AppEvents {
  'task.opened': { id: string };
  'task.closed': { id: string; reason: string };
  'task.comment.added': { text: string };
  toast: { variant: 'success' | 'error'; message: string };
  'app.ready': void;
  'order.placing': Cancelable<{ total: number }>;
}

const evem = new EvEm<AppEvents>();

await evem.publish('toast', { variant: 'success', message: 'Saved' });
await evem.publish('app.ready'); // no payload: the map says void

// @ts-expect-error -- '"toast:show" is not an event'
await evem.publish('toast:show', { message: 'Saved' });
// @ts-expect-error -- id is a string
await evem.publish('task.opened', { id: 7 });
```

## Wildcards

A pattern's subscribers receive the union of the payloads of the events it matches, under the [wildcard rules](events.md#using-wildcards-in-event-subscription):

```typescript
import { EvEm } from '@jcfigueiredo/evem';

interface AppEvents {
  'task.opened': { id: string };
  'task.closed': { id: string; reason: string };
  'task.comment.added': { text: string };
}
const evem = new EvEm<AppEvents>();

evem.subscribe('task.*', (task) => {
  // task: { id: string } | { id: string; reason: string } | { text: string }
  if ('reason' in task) console.log('closed:', task.reason);
});

evem.subscribe('task.*.added', (comment) => console.log(comment.text)); // { text: string }

// @ts-expect-error -- 'No event matches "billing.*"'
evem.subscribe('billing.*', () => {});
```

A pattern that matches no event is the error that matters most. Without a map, such a listener just never fires. The compiler's message names the cause: `Argument of type '"billing.*"' is not assignable to parameter of type '"No event matches \"billing.*\""'`.

Subscription options are typed too:
- filters and schemas receive the payload;
- a transform must return a payload of the same type, so later subscribers get what the map says.

## Cancelable events

Declare them with `Cancelable<T>`:
- their subscribers get `cancel()` and `canceled`;
- `publish` requires `{ cancelable: true }`.

```typescript
import { EvEm, type Cancelable } from '@jcfigueiredo/evem';

interface AppEvents {
  'order.placing': Cancelable<{ total: number }>;
}
const evem = new EvEm<AppEvents>();

evem.subscribe('order.placing', (order) => {
  if (order.total > 1000) order.cancel();
});

const placed = await evem.publish('order.placing', { total: 1200 }, { cancelable: true });
// @ts-expect-error -- a cancelable event says so when it's published
await evem.publish('order.placing', { total: 10 });
```

## Middleware and history

A middleware's handler receives `(event, data)` pairs, so checking the name narrows the data. A reroute must name an event and give its payload.

```typescript
import { EvEm } from '@jcfigueiredo/evem';

interface AppEvents {
  'task.opened': { id: string };
  'task.closed': { id: string; reason: string };
  'task.archived': { id: string };
}
const evem = new EvEm<AppEvents>();

evem.use({
  pattern: 'task.*',
  handler: (event, data) => {
    if (event === 'task.closed' && data.reason === 'archived') {
      return { event: 'task.archived', data: { id: data.id } }; // checked against the map
    }
    return data;
  },
});

evem.enableHistory();
const closed = evem.getEventHistory('task.closed'); // { event: 'task.closed'; data: { id; reason }; timestamp }[]
```

## Declaring once, with a runtime list

`defineEvents` declares the map as a value. The types come from it, and the emitter also gets the list of names at runtime. With `devWarnings`, the emitter then reports, once each:
- names published that aren't declared;
- patterns that match no declared event.

That covers code the compiler can't see: JavaScript files, names built at runtime, and Alpine templates (see the [Alpine plugin](../alpine.md)).

```typescript
import { EvEm, defineEvents, payload, type EventsOf } from '@jcfigueiredo/evem';

interface Task { id: string; lane: string; title: string }

export const appEvents = defineEvents({
  'task.opened': payload<{ id: string }>(),
  'server.task-changed': payload<Task>(),
  'app.ready': payload(), // no payload
});
export type AppEvents = EventsOf<typeof appEvents>;

// The map is inferred from the definitions; devWarnings is for development builds
const evem = new EvEm({ events: appEvents, devWarnings: true });

evem.subscribe('server.*', (task) => console.log(task.title));
```

The adapters declare their own events (`sse.ready`, `ws.send`…) to the emitter themselves. Server events are yours to declare: an undeclared one is still published, and `devWarnings` reports it.

## Another separator

With [another separator](events.md#another-separator), declare it once, as part of the events:

```typescript
import { EvEm, defineEvents, payload } from '@jcfigueiredo/evem';

const appEvents = defineEvents(
  { 'task:opened': payload<{ id: string }>(), 'lane:expand': payload<{ lane: string }>() },
  { separator: ':' }
);
const evem = new EvEm({ events: appEvents }); // the separator comes from the events

evem.subscribe('lane:*', ({ lane }) => console.log(lane));
```

Or in an interface, with the `SEPARATOR` key. The compiler then requires the constructor's `separator` option, and requires it to match, so the types and the emitter can't disagree:

```typescript
import { EvEm, SEPARATOR } from '@jcfigueiredo/evem';

interface AppEvents {
  [SEPARATOR]: ':';
  'task:opened': { id: string };
}

const evem = new EvEm<AppEvents>({ separator: ':' });
// @ts-expect-error -- the map says ':', so the option is required
const missing = new EvEm<AppEvents>();
```

## Adapters

`SseHandler`, `WebSocketHandler`, the DOM bridge and the Alpine plugin take any emitter, typed or not. To subscribe to the adapters' own events through a typed emitter:
- extend their maps, `SseEvents` and `WebSocketEvents`;
- declare the server events you receive, under the prefix.

With another separator, `WithSeparator` rewrites the adapter's map, which is written with dots:

```typescript
import { EvEm, SEPARATOR, type WithSeparator } from '@jcfigueiredo/evem';
import { SseHandler, type SseEvents } from '@jcfigueiredo/evem/sse';

interface Task { id: string; lane: string }

interface AppEvents extends WithSeparator<SseEvents, ':'> {
  [SEPARATOR]: ':';
  'server:task-changed': Task;
}

const evem = new EvEm<AppEvents>({ separator: ':' });
new SseHandler('/events/stream', evem, { readyEvent: 'keepalive' });

evem.subscribe('sse:ready', () => console.log('live'));
evem.subscribe('server:task-changed', (task) => console.log(task.lane));
```

## Untyped emitters

`new EvEm()` works as before:
- any name is accepted;
- payloads are typed per call (`subscribe<User>(…)`, or an annotated callback), and are `unknown` otherwise.

With a map, those explicit type arguments aren't accepted; the map gives the types.

A typed emitter needs TypeScript 5.0 or later. Untyped emitters work with the same versions as before.
