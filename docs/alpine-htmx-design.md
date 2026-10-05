# Alpine and htmx Integration: Draft

> **Status: draft for review.** Nothing here is built. It assesses what an Alpine.js plugin and an htmx extension for EvEm would look like, what they'd give an app, where they'd break, and whether each is worth building. It's grounded in a real adopter, Syzygy (FastAPI, JinjaX, htmx 2.0.11, htmx-ext-sse 2.2.4, Alpine 3.17.4), and in those libraries' sources. The code below is sketches, not final APIs.

## Summary

| Piece | What it is | Verdict |
|---|---|---|
| **DOM bridge** (`evem/dom`) | Mirror chosen EvEm events onto `window` as `CustomEvent`s, and chosen DOM events into EvEm | **Build it.** Small, framework-free, and both integrations below build on it. Plain Alpine and htmx attributes work with it unchanged |
| **Separator option** (`new EvEm({ separator: ':' })`) | Colons instead of dots between segments | **Build it, before the bridge.** Without it, Alpine can't name most bridged events (see [The naming problem](#the-naming-problem)) |
| **Alpine plugin** (`evem/alpine`) | A `$evem` magic with subscriptions that end with their element, and a reactive store for the connection | **Build it.** About 150 lines; it removes listener leaks and replaces hand-made readiness flags |
| **htmx extension** (`evem/htmx`) | `hx-trigger="evem:server:task:*"`: wildcard and priority triggers | **Not yet.** The bridge already gives htmx exact names through `from:window`; build this only when someone needs wildcards in a trigger |
| **EventSource shim for htmx-ext-sse** | An `EventSource`-shaped wrapper over `SseHandler`, so `sse:` triggers and `sse-swap` run on EvEm's connection | **No; at most a recipe.** It has the most pitfalls, and for Syzygy, rewriting its 6 `sse:` triggers is cheaper |

Suggested order: separator, then bridge, then Alpine plugin. The htmx pieces stay recipes until there's a need.

## What an adopter has today

Syzygy's frontend shows the problems these pieces would solve. Its framework, HyperFast, has a 591-line `sse.ts` (paths are in the Syzygy repository):

- **The connection belongs to htmx-ext-sse** (`<body hx-ext="sse, morph" sse-connect="/events/stream">`). Code that isn't an htmx attribute can't listen to it directly, so `sse.ts` replaces `window.EventSource` with a subclass to keep a handle on it. It keeps its own registry of listeners (`subscribeToSSEEvent`) and re-attaches them after every reconnection. Six components use it.
- **It bridges three events to `window` by hand**: `orchestration:step` becomes `orchestration-step` (a colon turned into a dash).
- **Readiness** is a `data-sse-connected` attribute set by the first `keepalive`. `whenSSELive()` watches it with a `MutationObserver`. `SseHandler`'s `readyEvent` and `whenReady()` (PR #32) replace both.
- **A 45-second health check** forces a reconnect by removing and re-adding the `sse-connect` attribute. htmx-ext-sse only reconnects on a native `error`, so a dead connection that still reads `OPEN` is never recovered. `SseHandler`'s `heartbeatTimeout` replaces it.
- **Back/forward cache and navigation handling** (about 150 lines; suggestion #5, page lifecycle).

In the templates (429 JinjaX files):
- 29 `@….window` and 26 `$dispatch(…)` in Alpine.
- 2 `from:window`, 7 `from:body` and 6 `sse:` triggers in htmx.
- 21 `$store` uses.

Event names use colons and dashes, never dots: `task:open`, `properties:population:changed`, `chat:run-started`, `task-changed`. A survey found a dead event (`toast:show` sent, nothing listens), a `$dispatch` nobody listens to, and a listener whose sender was removed.

## The naming problem

EvEm's segments are separated by dots: `server.task-changed`. Alpine reads dots in an event name as modifiers:

- Alpine 3.17 matches the event name with `/:([a-zA-Z0-9\-_:]+)/`, so it stops at the first dot. Colons and dashes are allowed. `@server.task-changed.window` listens to `server`, with modifiers `task-changed` and `window`.
- The escape is `.dot`, which turns **every** dash into a dot. `@server-task-changed.dot.window` listens to `server.task.changed`, not `server.task-changed`. A name with both a dot and a dash can't be written with `@` or `x-on` at all, and every Syzygy SSE name has a dash.
- A listener with the wrong name fails silently: no error, it just never fires.

htmx has no such problem: `hx-trigger` reads the event name up to a comma, a `[` or a space, so `server.task-changed from:window` works.

Three ways out:

1. **A separator option** (suggestion #4): `new EvEm({ separator: ':' })`. Wildcards then work over the names apps already use (`task:*`, `server:chat:*`). The SSE and WebSocket prefixes join with it (`server:task-changed`), and the bridge needs no mapping. Every name Syzygy uses is valid as it is, and `@server:task-changed.window` works.
2. **A name mapping in the bridge** (dots to colons, say). It works, but the same event then has two names, one in TypeScript and one in templates, which is exactly what made Syzygy's dead events hard to see.
3. **Let the Alpine plugin avoid attribute names**, taking the pattern from an expression (`$evem.on('server.task.*', …)`). That fixes the plugin but not plain `@….window` listeners.

**Recommendation:** the separator option first. The mapping stays available in the bridge for apps that keep dots.

The separator touches:
- `isEventMatch`
- `toServerEventName` (the prefix join)
- the demo's match explainer (`explainMatch`)
- the wildcard property tests, which would also run with `:`

It's opt-in per instance, so nothing changes for existing code.

## DOM bridge (`@jcfigueiredo/evem/dom`)

```typescript
import { bridgeToDom, bridgeFromDom } from '@jcfigueiredo/evem/dom';

// EvEm → window: every server event becomes a CustomEvent with the data as detail
const stop = bridgeToDom(evem, {
  patterns: ['server:*', 'toast'],
  target: window,                 // default
  name: event => event,           // default: the same name (map dots to colons here if you keep dots)
});

// window → EvEm: $dispatch('lane:expand', {...}) also reaches EvEm subscribers
bridgeFromDom(evem, { names: ['lane:expand', 'toast'], target: window });
```

- **To the DOM:** one subscription per pattern. Each event dispatches `new CustomEvent(name, { detail: data })` on the target, so `@server:task-changed.window` and `hx-trigger="server:task-changed from:window"` both work with no plugin.
  - `[detail.id == 3]` filters work in htmx.
  - In Alpine, `$event.detail` is the data.
- **From the DOM:** one listener per name. Each event is published with `event.detail` as the data.
- **Loops:** an event bridged both ways would loop. The bridge marks the events it dispatches and ignores them on the way back.
- **Testing:** in Node.js. `EventTarget` and `CustomEvent` are globals in Node 22, so no DOM library is needed.
- **Size:** about 80 lines.

Pitfalls:
- **What the bridge loses:**
  - **Ordering and priority** stop at the DOM boundary: DOM listeners run in registration order.
  - **Cancelable** events can't be canceled from the DOM side.
  - Middleware, filters and history apply on the EvEm side only.
- **Bubbling.** Events dispatched on `window` don't bubble anywhere, which is what `@….window` and `from:window` expect. A `from:body` trigger needs the bridge to target `document.body`, so the bridge takes a target per pattern.
- **Cloned detail.** `$dispatch` details are plain objects; EvEm data can be anything. A cancelable event's proxy (a `Map`, a `Date`) isn't safe to hand to code that clones, so the bridge passes data as published, before cancel support.

## Alpine plugin (`@jcfigueiredo/evem/alpine`)

```typescript
import Alpine from 'alpinejs';
import { evemAlpine } from '@jcfigueiredo/evem/alpine';

Alpine.plugin(evemAlpine(evem, { sse }));   // before Alpine.start()
```

```html
<!-- subscribe for this element's lifetime: unsubscribed when Alpine removes it (htmx swap, x-if, x-for) -->
<div x-data="{ tasks: [] }"
     x-init="$evem.on('server:task:*', task => upsert(tasks, task), { priority: 'high' })">

<!-- publish -->
<button @click="$evem.publish('lane:expand', { lane: 'doing' })">Expand</button>

<!-- reactive connection state, from SseHandler -->
<span x-show="!$store.evem.ready">Reconnecting…</span>
```

The parts:

- **`$evem` magic.** `publish`, and `on(pattern, callback, options)`, the full subscription options (wildcards, priority, filter, throttle, debounce, once, replay).
  - `on` registers its unsubscribe with the element's `cleanup()`. Alpine runs that when the element leaves the DOM, including after an htmx swap, so a removed component never keeps a listener. Syzygy's "listener whose sender was removed" is the opposite case; this one ("component removed, listener left") is the usual leak.
- **`$store.evem`** (with the `sse` option): `{ state, ready, lastEventId }`. It's kept in step from `sse.connection.state` and `sse.ready`, and is reactive, so `x-show`, `:class` and `x-effect` follow the connection.
  - It replaces Syzygy's `data-sse-connected` and `data-sse-down` attributes and the observer in `sse-live.ts`.
- **Optionally, an `x-evem` directive** for exact names: `x-evem:server:task-changed="reload()"`.
  - Alpine's attribute grammar allows only letters, digits, `-`, `_` and `:` in the name, so wildcards and dots can't go there. The magic covers those.
  - It's sugar; leave it out of a first version.
- **No dependency on Alpine.** The plugin receives the Alpine object (`Alpine.plugin` calls it with it) and uses structural types, so there's no peer dependency and no version lock.

What it gives an app:
- Subscriptions scoped to a component's lifetime.
- EvEm's features in templates. `replayLastEvent` matters here: a component that mounts after an htmx swap can get the latest state without asking the server again.
- Reactive connection state, and one bus instead of two (window events and a hand-made SSE registry).

Pitfalls:
- **Templates aren't type-checked.** A typed event map (suggestion #2) checks TypeScript code, not strings inside HTML attributes, so a misspelled name in `$evem.on('…')` stays silent. Mitigations:
  - `$evem.on` can warn in development when a pattern matches no known event. That needs the event map at runtime: a list of names, or the map's keys.
  - A template lint is outside EvEm.
- **Alpine's evaluation context.** Callbacks written in templates run in Alpine's scope, outside EvEm's publish chain tracking. Recursion limits still apply, because `publish` checks them. But an async callback that publishes after its own `await` starts a new chain, as it would in any code.
- **Morphing.** With idiomorph (Syzygy's `morph` extension), elements are kept and patched rather than replaced. Their `x-init` doesn't run again and their cleanup doesn't run, which is correct: the subscription lives as long as the element. A morph that does replace an element runs both, so nothing leaks.
- **Initialisation order.** The plugin must be registered before `Alpine.start()`, and the `sse` handler created before it. Syzygy's `setupFrameworkFrontend(Alpine, …)` is the natural place.
- **Testing** needs a DOM. Either:
  - a dev dependency on happy-dom or jsdom for unit tests with real Alpine, or
  - tests against a fake Alpine object, plus a check in Chrome on the demo site.

  The first is more honest. It adds a dev dependency, never a runtime one.

## htmx

### Without an extension

With the bridge, htmx needs nothing:

```html
<div hx-get="/board/lane/doing" hx-trigger="server:task-changed[detail.lane=='doing'] from:window delay:300ms">
```

`from:window`, filters on `detail`, `delay:`, `throttle:` and `queue:` all work on bridged events. Syzygy's 6 `sse:` triggers would become `from:window` triggers on bridged names. Its richest one shows the shape:

```
sse:content-changed[detail.data.includes('document') && !documentsListHold()] delay:500ms, …
```

It reads `detail.data` because htmx-ext-sse passes the raw `MessageEvent`. With the bridge, `detail` is the parsed data, so the filter becomes a property test (`detail.kind == 'document'`).

### An `evem:` trigger extension (later, if needed)

```html
<div hx-ext="evem" hx-get="/board" hx-trigger="evem:server:task:* throttle:1s">
```

- **How:** `htmx.defineExtension('evem', { onEvent })`.
  - On `htmx:afterProcessNode`, read the element's `hx-trigger` for `evem:` specs and subscribe with the pattern, which can be a wildcard.
  - Each event calls `htmx.trigger(elt, 'evem:' + pattern, data)`, which runs the element's own trigger with its filters and modifiers.
  - On `htmx:beforeCleanupElement`, unsubscribe.
- **Gains over the bridge:**
  - wildcard triggers;
  - subscriptions made only for elements that ask, instead of a bridge pattern dispatching every event to `window`;
  - EvEm's priority between triggers.
- **Pitfalls:**
  - htmx parses `hx-trigger` itself; the extension parses it again for its own specs and must agree on the syntax (commas inside filters, for instance).
  - htmx's own listener for `evem:…` must exist, so the extension triggers the literal spec name, which then can't vary per event.
  - `hx-ext` inheritance (`ignore:`) applies.
  - About 100 lines, mostly parsing.
- **Verdict:** not until someone needs wildcard triggers. Syzygy's triggers are all exact names.

### An EventSource shim for htmx-ext-sse

htmx-ext-sse 2.2.4 calls `htmx.createEventSource(url)` if you define it before the extension loads. A wrapper with `addEventListener`, `readyState`, `onopen`/`onerror` and `close()` over a shared `SseHandler` would keep `sse-connect`, `sse-swap` and `hx-trigger="sse:…"` as they are, on EvEm's connection, with its heartbeat and readiness.

The pitfalls, from htmx-ext-sse's source:

- **Two reconnect loops.** After `onerror`, the extension retries itself only when `readyState === CLOSED` (from 0.5 s, doubling up to 64 s), and leaves retrying to the browser otherwise. The shim must report `CONNECTING`, never `CLOSED`, while `SseHandler` is reconnecting. It reports `CLOSED` only once the handler has stopped, and then the extension's own retry calls `createEventSource` again, which must hand back the same handler.
- **`close()` from cleanup.** The extension closes its source when the `sse-connect` element is replaced or missing (`nodeReplaced`, `nodeMissing`), or on `sse-close`. A shared handler must count its users and disconnect only when the last one closes. Otherwise an htmx swap of a fragment containing `sse-connect` kills every other listener.
- **Raw `MessageEvent`s.** `sse-swap` swaps `event.data` and `sse:` triggers pass the event as `detail`, so the shim must dispatch `MessageEvent`-shaped events with the **raw** text. EvEm's parsing and routing then don't apply on that path, and the same message is parsed twice: once for EvEm subscribers, once by templates.
- **Re-registration.** After a retry, the extension registers listeners again on `onopen`. The shim must call `onopen` after every reconnection, or `sse:` triggers registered before a drop stop firing. In 2.2.4, a listener for a removed element isn't removed before it triggers (a missing `return`), and the shim must tolerate that.
- **Syzygy already overrides `window.EventSource`**, so the shim would go in that place.

**Verdict:** not in EvEm. It keeps a second event model (raw `MessageEvent`s) alive, and its correctness rests on another library's retry logic. For Syzygy, replacing 6 `sse:` triggers and the one `sse-connect` with the bridge is less work and removes htmx-ext-sse altogether. A docs recipe could show the shim for apps with many `sse-swap` attributes, with these pitfalls stated.

## Packaging

- **New entry points** `@jcfigueiredo/evem/dom` and `@jcfigueiredo/evem/alpine`, and later `@jcfigueiredo/evem/htmx`. Each goes through its own index file, like the adapters, with `pnpm test:package` extended to import them.
- **No runtime or peer dependencies:** Alpine and htmx are passed in, and typed structurally.
- **Browser-only code** (`window`, `CustomEvent`) is reached only when called, so importing an entry point in Node.js doesn't throw.
- **The demo site** gets an Alpine scenario. The playground's engine runs code in a sandbox without Alpine, so this is probably a showcase card with a small Alpine island.

## Effort and order

| Step | Size | Depends on |
|---|---|---|
| Separator option | Medium: matching, prefixes, the demo's explainer, property tests with `:` | — |
| DOM bridge | Small | the separator, for clean names |
| Alpine plugin (magic, store) | Small–medium, plus a DOM test setup | the bridge (for `$dispatch` interop), PR #32 (readiness) for the store |
| Typed event map | Large; separate design | — (helps all of the above in TypeScript, not in templates) |
| htmx `evem:` extension | Medium | the bridge; only on demand |
| EventSource shim | Recipe only | — |

## Decisions

Agreed in review:

1. **The separator is set per instance**, `new EvEm({ separator: ':' })`. The adapters read it from the instance they're given, and there's no global default.
2. **The bridge goes to the DOM only by default.** `bridgeFromDom` is a separate, explicit call, so nothing loops unless both directions were asked for.
3. **The Alpine plugin is tested with happy-dom** (a dev dependency) and real Alpine, plus a check in Chrome on the demo site.
4. **`$evem.on` warns in development when its pattern matches no known event.**
   - Types don't exist at runtime, so this needs the known names as a list. The typed event map design should provide both from one declaration, e.g. names declared once that yield the type and the runtime list.
   - Without such a list, the plugin can't warn, and says so once at start-up in development.
   - "Development" is the bundler's `import.meta.env.DEV`, or a `dev` option, since the library can't detect it by itself.
