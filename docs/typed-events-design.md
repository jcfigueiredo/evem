# Typed Event Map: Design

> **Status: draft for review.** Nothing here is built. It proposes an optional typed event map for EvEm: `new EvEm<AppEvents>()`, so event names and payloads are checked, wildcard subscriptions included. Suggested by Syzygy, whose survey of browser events found a dead event, a dispatch nobody listens to and a listener whose sender was removed. `docs/comparison.md` names it as EvEm's gap against Mitt and EventEmitter3.

## Summary

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import type { SseEvents } from '@jcfigueiredo/evem/sse';

interface AppEvents extends SseEvents {
  'task.opened': { id: string };
  'task.closed': { id: string; reason: string };
  'server.task-changed': Task;
  toast: { variant: 'success' | 'error'; message: string };
  'app.ready': void;
}

const evem = new EvEm<AppEvents>();

evem.publish('toast', { variant: 'success', message: 'Saved' });   // checked
evem.publish('toast:show', { message: 'Saved' });                  // error: not an event
evem.publish('task.opened', { id: 7 });                            // error: id is a string

evem.subscribe('task.*', (task) => {
  // task: { id: string } | { id: string; reason: string }
});
evem.subscribe('billing.*', () => {});                             // error: matches no event
```

Without a map, `new EvEm()` behaves and types exactly as today.

## Goals

- **Names and payloads checked** in `publish`, `subscribe`, `subscribeOnce`, `unsubscribe`, middleware, history and the adapters' events.
- **Wildcards typed:** a pattern's payload is the union of the payloads of the events it matches. A pattern that matches nothing is an error. This catches the misspelled listener, which is the bug that matters most.
- **Opt-in, no breaking change:** untyped code compiles as it does now, explicit generics (`subscribe<T>`) included.
- **No runtime cost**, apart from an optional runtime list of names for development warnings (the Alpine plugin's).
- **Composable with the adapters:** `SseEvents` and `WebSocketEvents` already map their events; an app's map extends them.

Non-goals: checking names inside HTML templates (strings the compiler never sees); see [Templates](#templates-and-the-runtime-list).

## Feasibility

The wildcard rules can be expressed as TypeScript types: split names on the separator with template-literal types, and match the parts recursively. A trailing `*` matches one or more segments, a `*` elsewhere exactly one, and `*` alone everything. A prototype type-checks against EvEm's rules in strict mode with the repository's TypeScript (5.x):

- exact names;
- `task.*` matches `task.opened` but not `task.comment.added`;
- `*.login`;
- `*` alone;
- a pattern matching nothing gives `never`;
- the `:` separator.

It adds roughly 30 lines of types.

## API

### The class

```typescript
class EvEm<Events extends EventMap = UntypedEvents, Separator extends string = '.'> { … }
```

- **`Events`:** the map from event name to payload type.
  - The default, `UntypedEvents`, keeps today's behavior: any string name and `unknown` payloads, with explicit generics (`subscribe<T>`, `publish<T>`) honored.
  - With a map, the methods use it, and explicit generics are no longer needed.
- **`Separator`:** follows the separator option from the [Alpine and htmx draft](alpine-htmx-design.md), so wildcard types split names the way matching does. `new EvEm<AppEvents, ':'>({ separator: ':' })`.
  - TypeScript can't infer one type argument and take the other explicitly, so the separator is given twice.
  - Alternative: declare it in the map, e.g. `{ [separatorKey]: ':' }`. Open question 1.

### Methods with a map

| Method | Typed as |
|---|---|
| `publish(name, data?, options?)` | `name` is a key of the map, and `data` its payload. `data` is optional only when the payload accepts `undefined` or `void` |
| `subscribe(pattern, callback, options?)` | `pattern` is a name or a wildcard matching at least one name. The callback receives the union of the matching payloads, and options (filter, transform, schema) are typed with it |
| `subscribeOnce`, `unsubscribe` | Like `subscribe` |
| `use(middleware)` / `use({ pattern, handler })` | The handler receives `(name, data)` as a union of the pairs its pattern matches, so narrowing on `name` narrows `data`. A reroute (`{ event, data }`) must name an event and give its payload |
| `getEventHistory(pattern?)` | Records typed as a union of `{ event, data }` pairs |
| `info`, `enableHistory`, … | Unchanged |

A transform changes the data later subscribers of the same publish receive. With a map, it must return the event's payload type, so the data stays what the map says. Untyped code is unchanged.

### Adapters

- **The handlers take any emitter:** `SseHandler` and `WebSocketHandler` take an `EvEm` today. They'll take `EvEm<any, any>`, so a typed emitter can be passed. Their own publishes (`sse.error`, `server.<name>`) are typed against `SseEvents` and `WebSocketEvents`, which already exist.
- **Server events are the app's to declare** (`'server.task-changed': Task`): the adapter can't know their names. An event the server sends but the map lacks is still published at runtime. The types simply can't subscribe to it without a wildcard, and the [development warning](#templates-and-the-runtime-list) can say so.
- **`serverEventPrefix`** is a runtime option, so the names the map declares must use the same prefix and separator. The docs show that pairing; a type-level check is out of reach.

### Cancelable events

A subscriber can't know whether a given publish was cancelable. Options:
- the callback is typed with the payload alone, and cancelable subscribers annotate `data: Task & CancelableEvent`; or
- the map declares cancelable events (`'order.placing': Cancelable<Order>`), so every subscriber gets `cancel()`, and `publish` requires `{ cancelable: true }` for them.

The second is safer. Open question 2.

### Events without data

`publish('app.ready')` delivers `{}` at runtime today: a missing payload becomes an empty object, so it can be canceled. A map that declares `'app.ready': void` would then mistype what subscribers get. Options:

- **(a)** Type a missing payload as `Record<string, never>`, matching the runtime.
- **(b)** Change the runtime so a missing payload is delivered as `undefined`, with `{}` only for cancelable publishes. That's a behavior change, for the changelog.

I'd take (b) in the same minor release: it makes the types honest and `void` events natural. Open question 3.

## Templates and the runtime list

Types check TypeScript, not the event names inside HTML attributes. The [Alpine plugin](alpine-htmx-design.md#decisions) warns in development when a pattern matches no known event. For that it needs the names at runtime, and a map is types only. A helper declares both from one source:

```typescript
import { defineEvents, type EventsOf } from '@jcfigueiredo/evem';

export const appEvents = defineEvents({
  'task.opened': defineEvents.payload<{ id: string }>(),
  toast: defineEvents.payload<{ variant: 'success' | 'error'; message: string }>(),
  'app.ready': defineEvents.payload<void>(),
});
export type AppEvents = EventsOf<typeof appEvents>;

const evem = new EvEm<AppEvents>({ events: appEvents });   // the runtime list, for warnings
```

- **The helper** is a plain object of names, with a marker per payload; the marker carries no runtime data.
- **Passing the list to EvEm (`events`)** lets the core warn too, in development, about publishes and subscriptions no declared event matches. That covers code paths types can't see: JavaScript files, and names built at runtime.
- **The interface form** (`interface AppEvents { … }`) stays for apps that don't want the runtime list.
- **Later:** a marker could also carry a schema validator, tying the map to schema validation. Not in the first version.

## Testing

- **Type tests:** a `tests/types/` folder with `expectTypeOf` (Vitest) and `// @ts-expect-error` cases for each rule (exact names, each wildcard form, a pattern that matches nothing, both separators, middleware narrowing, reroutes, adapters). They run in `pnpm typecheck`, so CI covers them.
- **Docs samples:** the docs' samples are type-checked already (`tests/docs/`), so the typed examples in the guide are checked too.
- **The package check:** extended with a strict consumer using a map, with and without Node.js types, so the published `.d.ts` files keep working.

## Risks

- **Error messages.** A conditional type that resolves to `never` gives errors like "not assignable to parameter of type never". Named helper types (`NoEventMatches<'billing.*'>`) make the message point at the cause; worth the effort.
- **Compile time.** Matching is per pattern against every key. That's fine for hundreds of events, but each `subscribe` call with a literal pattern costs some checking. Measured in the type tests with a large map before release.
- **Declaration emit** for consumers on older TypeScript. The package's TypeScript floor needs stating. `infer … extends` in conditional types needs 4.7+; I'd state 5.0+, the version the repository builds with.
- **Type complexity in `eventEmitter.ts`.** The types go in their own module (`src/eventTypes.ts`), re-exported from the entry point. The class's signatures change, not its code.

## Effort

Medium–large: about a day of types and type tests, plus the docs (a guide page, the API reference, the comparison page) and the `defineEvents` helper. The runtime changes are small (the `events` option and its development warnings, and option 3(b) if chosen).

Order: after the separator option, since the types take the separator as a parameter.

## Decisions

Agreed in review, as recommended:

1. **The separator is declared once, and the compiler keeps it in step.**
   - **With `defineEvents`** (the recommended path), the separator is a runtime value given with the events: `defineEvents({ … }, { separator: ':' })`. `new EvEm({ events: appEvents })` infers both the map and the separator from it, so there's one source and nothing to keep in sync.
   - **With an interface**, the map declares it (`[separator]: ':'`). The constructor's `separator` option is then required, and must equal it: `new EvEm<AppEvents>()` is a compile error when the map says `':'`. It's written twice, but it can't be forgotten or drift.
   - **Without a map**, `new EvEm({ separator: ':' })` infers it.
   - **The adapters' maps** (`SseEvents`, `WebSocketEvents`) are written with dots. With another separator, their keys are rewritten at the type level, since the adapters then publish `sse:error` rather than `sse.error`.
2. **Cancelable events are declared in the map** (`Cancelable<T>`). Their subscribers get `cancel()` and `canceled` typed, and `publish` requires `{ cancelable: true }` for them.
3. **Events without data are delivered as `undefined`.** `{}` stays only for cancelable publishes, which need an object to cancel. This is a behavior change, for the changelog.
4. **The runtime list comes from `defineEvents`.** Interfaces stay supported without it, and the development warnings then can't run.
