# Python Servers for the SSE Adapter

`SseHandler` works with any server that writes the `text/event-stream` format. This guide is for servers written in Python. It covers:

- a helper that writes the format exactly like the JavaScript one;
- runnable examples for the standard library, FastAPI and Flask;
- what to watch for when deploying.

The client side (options, events, reconnection) is covered in the [SSE Adapter](sse-adapter.md) guide.

- [The helper: evem_sse.py](#the-helper-evem_ssepy)
- [How the client routes what you send](#how-the-client-routes-what-you-send)
- [Examples](#examples)
- [Resuming with Last-Event-ID](#resuming-with-last-event-id)
- [Heartbeats](#heartbeats)
- [Native EventSource clients](#native-eventsource-clients)
- [Deployment](#deployment)
- [Testing](#testing)

## The helper: evem_sse.py

[`examples/python/evem_sse.py`](../examples/python/evem_sse.py) is a single file that needs only the standard library (Python 3.8+). It isn't published on PyPI: copy it next to your app (or anywhere on the import path).

```python
>>> from evem_sse import SSE_HEADERS, format_sse_comment, format_sse_message
>>> format_sse_message("order.updated", {"id": 7, "status": "shipped"}, id=42)
'event: order.updated\nid: 42\ndata: {"id":7,"status":"shipped"}\n\n'

```

It writes the same text as the JavaScript helper (`formatSseMessage`, `formatSseComment` and `SSE_HEADERS` from `@jcfigueiredo/evem/sse/server`) for the same values. The tests check this byte for byte (see [Testing](#testing)).

### format_sse_message

```text
format_sse_message(event=None, data=<omitted>, id=None, retry=None, *, raw=False, envelope=False) -> str
```

| Argument | Description |
|----------|-------------|
| `event` | Event type. The client publishes it as `server.<event>`. |
| `data` | Payload, JSON-encoded (strings included), matching the client's default `parseData: 'json'`. `None` is sent as `null`. |
| `id` | `str` or `int`. The client sends the last id back as `Last-Event-ID` when it reconnects. |
| `retry` | Reconnection delay for the client, in ms (an `int` from 0 to 2\*\*53 − 1). |
| `raw` | Write a `str` as plain text, one `data:` line per line, for clients using `parseData: 'text'`. Other values are still JSON-encoded. |
| `envelope` | Write an unnamed message whose data is `{"event": …, "data": …}`, for [native EventSource clients](#native-eventsource-clients). Needs an `event`. |

The result is a `str` that ends with the blank line that dispatches the event. Encode it as UTF-8 if you write to a socket yourself; frameworks do this for you.

- **Data:** JSON is written compactly, with non-ASCII characters as they are, like `JSON.stringify`:

  ```python
  >>> format_sse_message(data="héllo 😀")
  'data: "héllo 😀"\n\n'

  ```

- **Line breaks:** every line of data gets its own `data:` field, so content containing blank lines or `event: …` can't end the event early or forge another one. Text is split only on `\r\n`, `\r` and `\n`, like the client does, not with `str.splitlines()`:

  ```python
  >>> format_sse_message(data="line one\nline two", raw=True)
  'data: line one\ndata: line two\n\n'

  ```

- **Events without data:** the client never dispatches an event without data, so a named event without `data` is sent with `data: null`. With neither `event` nor `data`, only `id` and `retry` are written:

  ```python
  >>> format_sse_message("refresh")
  'event: refresh\ndata: null\n\n'
  >>> format_sse_message(retry=5000)
  'retry: 5000\n\n'

  ```

- **Field order:** fields are written in the same order as in JavaScript: `event`, `id`, `retry`, `data`.
- **Validation:** a line break in `event` or `id`, a NUL in `id`, a `retry` that isn't an `int` from 0 to 2\*\*53 − 1 (JavaScript's `Number.MAX_SAFE_INTEGER`), and `envelope` without `event` raise `ValueError`. Such values would corrupt the stream, or be silently ignored by clients.

### format_sse_comment

`format_sse_comment(text="")` writes a comment, one `:` line per line of text. Clients ignore comments. Servers send them as [heartbeats](#heartbeats).

```python
>>> format_sse_comment("ping")
': ping\n\n'

```

### SSE_HEADERS

```python
>>> SSE_HEADERS
{'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no'}

```

These headers set:

- the content type;
- no caching and no transforms (a compressing proxy would buffer the stream);
- no nginx buffering.

`Connection: keep-alive` is left out on purpose: HTTP/2 servers reject it. `SSE_HEADERS` is a plain dict shared by every response, so copy it to add headers: `{**SSE_HEADERS, "X-Request-Id": request_id}`.

### Differences from the JavaScript helper

| | JavaScript | Python |
|---|------------|--------|
| Call | `formatSseMessage({ event, data, id, retry }, { raw, envelope })` | `format_sse_message(event, data, id=…, retry=…, raw=…, envelope=…)` |
| No data | `data` left out (`undefined`) | `data` left out (`None` is `null`, like JS `null`) |
| Invalid values | `TypeError` / `RangeError` | `ValueError` |
| Wrong types | not allowed by the TypeScript types | `TypeError`: `event` must be a `str`; `id` a `str` or `int` (not `float` or `bool`) |
| `retry` | any safe integer number, including `5000.0` | an `int` only (`5000.0` raises `ValueError`) |
| NaN and infinity | written as `null` | `ValueError` |
| Floats | `1`, `1e-7` | `1.0`, `1e-07`: written differently, but `JSON.parse` reads the same number |
| Values JSON can't encode | `toJSON()` is used (a `Date` becomes an ISO string) | `TypeError` from `json`: convert first, e.g. `dt.isoformat()`, `dataclasses.asdict(obj)`, `model.model_dump(mode="json")` |
| Large integers | can't be represented above 2^53 | written exactly, but JS clients read them as doubles: send large ids and numbers as strings |
| Object key order | integer-like keys first | dict order (the client gets the same object) |

## How the client routes what you send

With the default options (`serverEventPrefix: 'server'`, `parseData: 'json'`, `unwrapEnvelope: true`):

| The server sends | `SseHandler` publishes | Subscribers receive |
|------------------|------------------------|---------------------|
| `format_sse_message("order.updated", {"id": 7})` | `server.order.updated` | `{ id: 7 }` |
| `format_sse_message("server.notice", "hi")` | `server.notice` (the prefix isn't added twice) | `'hi'` |
| `format_sse_message("refresh")` | `server.refresh` | `null` |
| `format_sse_message("order.updated", {"id": 7}, envelope=True)` | `server.order.updated` | `{ id: 7 }` |
| `format_sse_message(data={"id": 7})` (unnamed, no envelope) | `sse.message` | `{ id: 7 }` |
| `format_sse_message("note", "a\nb", raw=True)` | `sse.parse.error` (it isn't JSON); `server.note` with `parseData: 'text'` | `{ error, rawData, … }`; `'a\nb'` |
| `format_sse_comment("ping")` | nothing (but it resets `heartbeatTimeout`) | — |

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
const sse = new SseHandler('/events', evem);
evem.subscribe('server.order.*', (order: { id: number }) => render(order));
```

## Examples

All three examples stream numbered `tick` events (`{"n": 1}`, `{"n": 2}`, …) on `/events`. The client receives them as `server.tick`. Each tick's id is its number, so resuming is simply continuing after the id the client sends back.

### Standard library: server.py

[`examples/python/server.py`](../examples/python/server.py) uses only `http.server` (one thread per connection). It's fine for development, demos and tests, and the cross-language tests use it.

```bash
python3 examples/python/server.py --port 8000
curl -N http://127.0.0.1:8000/events
```

```text
retry: 1000

event: tick
id: 1
data: {"n":1}

event: tick
id: 2
data: {"n":2}

```

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `8000` | `0` picks a free port. The port is always the first line on stdout; the log goes to stderr. |
| `--host` | `127.0.0.1` | Interface to listen on. |
| `--interval` | `1` | Seconds between ticks. |
| `--heartbeat` | `15` | Seconds of silence before a `: ping` comment. |
| `--retry` | `1000` | The `retry:` sent to clients, in ms. |
| `--drop-after N` | — | End the first connection after N events, to show the client resuming. |

It resumes from the `Last-Event-ID` header or the `lastEventId` query parameter. It sends heartbeats, and logs when a client disconnects (`BrokenPipeError` / `ConnectionResetError` on the next write).

### FastAPI / Starlette

[`examples/python/fastapi_app.py`](../examples/python/fastapi_app.py):

```bash
pip install fastapi uvicorn
uvicorn fastapi_app:app --port 8000
```

```python
import asyncio
import re
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from evem_sse import SSE_HEADERS, format_sse_comment, format_sse_message

TICK_SECONDS = 1.0
HEARTBEAT_SECONDS = 15.0
RETRY_MS = 1000

app = FastAPI()


def resume_after(request: Request) -> int:
    """The last event id the client received: the Last-Event-ID header (sent by SseHandler and by
    EventSource's own reconnects) or the lastEventId query parameter (a new EventSource)."""
    for value in (request.headers.get("last-event-id"), request.query_params.get("lastEventId")):
        if value and re.fullmatch(r"[0-9]+", value):
            return int(value)
    return 0


async def ticks(request: Request, last: int) -> AsyncIterator[str]:
    loop = asyncio.get_running_loop()
    yield format_sse_message(retry=RETRY_MS)
    next_tick = loop.time()
    try:
        while not await request.is_disconnected():
            wait = next_tick - loop.time()
            if wait > HEARTBEAT_SECONDS:
                await asyncio.sleep(HEARTBEAT_SECONDS)
                yield format_sse_comment("ping")
                continue
            await asyncio.sleep(max(0.0, wait))
            last += 1
            yield format_sse_message("tick", {"n": last}, id=last)
            next_tick += TICK_SECONDS
    finally:
        # Runs when the client disconnects: release per-connection resources here
        print(f"stream closed after event {last}", flush=True)


@app.get("/events")
async def events(request: Request) -> StreamingResponse:
    return StreamingResponse(ticks(request, resume_after(request)), headers=SSE_HEADERS)
```

- **Headers:** `StreamingResponse` keeps the `Content-Type` from `SSE_HEADERS`, so there's no need for `media_type`.
- **Disconnects:** under uvicorn, Starlette listens for the client's disconnect and cancels the generator right away, even in the middle of a sleep, so `finally` runs. `request.is_disconnected()` covers servers where Starlette doesn't do that (ASGI spec 2.4 and later), where a disconnect otherwise only shows up as a failed write.
- **Real events:** in a real app the generator waits for events instead of sleeping. Wait on a per-client `asyncio.Queue` with a timeout of `HEARTBEAT_SECONDS`, and send a ping when the wait times out.
- **Don't block the event loop:** use async I/O in the generator. One blocking call stalls every stream in the process.

### Flask

[`examples/python/flask_app.py`](../examples/python/flask_app.py):

```bash
pip install flask
flask --app flask_app run --port 8000
```

```python
import re
import time
from typing import Iterator

from flask import Flask, Response, request, stream_with_context

from evem_sse import SSE_HEADERS, format_sse_comment, format_sse_message

TICK_SECONDS = 1.0
HEARTBEAT_SECONDS = 15.0
RETRY_MS = 1000

app = Flask(__name__)


def resume_after() -> int:
    """The last event id the client received: the Last-Event-ID header (sent by SseHandler and by
    EventSource's own reconnects) or the lastEventId query parameter (a new EventSource)."""
    for value in (request.headers.get("Last-Event-ID"), request.args.get("lastEventId")):
        if value and re.fullmatch(r"[0-9]+", value):
            return int(value)
    return 0


@app.get("/events")
def events() -> Response:
    def ticks() -> Iterator[str]:
        last = resume_after()  # stream_with_context keeps `request` usable in here
        yield format_sse_message(retry=RETRY_MS)
        next_tick = time.monotonic()
        try:
            while True:
                wait = next_tick - time.monotonic()
                if wait > HEARTBEAT_SECONDS:
                    time.sleep(HEARTBEAT_SECONDS)
                    yield format_sse_comment("ping")
                    continue
                time.sleep(max(0.0, wait))
                last += 1
                yield format_sse_message("tick", {"n": last}, id=last)
                next_tick += TICK_SECONDS
        finally:
            # Runs when a write fails because the client disconnected (WSGI servers only notice
            # then, so the heartbeat also bounds how long a dead stream holds a thread)
            print(f"stream closed after event {last}", flush=True)

    return Response(stream_with_context(ticks()), headers=SSE_HEADERS)
```

- **Headers:** `Response` keeps the `Content-Type` from `SSE_HEADERS` instead of its `text/html` default.
- **Disconnects:** WSGI has no disconnect notification. The server finds out when the next write fails, closes the generator, and `finally` runs.
- **Threads:** each open stream holds a worker thread for as long as it's open. The development server (`flask run`) is threaded; for production, see [Workers](#workers-and-processes).

## Resuming with Last-Event-ID

When an event has an `id`, the client remembers it. When the connection drops, `SseHandler` reconnects and sends the last id back:

- **fetch transport (the default):** in the `Last-Event-ID` header, on every reconnect. It's also sent on the first connection when the client sets the `lastEventId` option, e.g. to resume after a page reload with an id saved from `getLastEventId()`.
- **EventSource transport:**
  - while the browser reconnects by itself, it sends the `Last-Event-ID` header;
  - when the handler has to create a new `EventSource`, it adds a `lastEventId` query parameter instead (renamed with `lastEventIdParam`), because `EventSource` can't set headers.

So read both, and prefer the header. A browser that reconnects by itself keeps the URL it was created with, including an older `lastEventId`, and sends the newer id in the header. All three examples do this (`resume_after`). The id comes from the client, so validate it.

The examples start every stream with `format_sse_message(retry=RETRY_MS)`. The client waits about that long before reconnecting, and longer after repeated failures (it backs off).

The examples compute events from their ids, so resuming means continuing after the id. A real app has to send the events the client missed. Two ways to do that:

- keep a replay buffer, e.g. the last few thousand `(id, message)` pairs in a `collections.deque`;
- read from a durable log: a table ordered by id, Redis Streams, Kafka.

If the id is older than anything you still have, send an event that tells the client to reload its state (e.g. `format_sse_message("resync")`). Use ids that increase within a stream. With several server processes, take them from the shared source, not from a per-process counter, so a reconnect can land on any process.

## Heartbeats

When there's nothing to send for a while, send a comment: `format_sse_comment("ping")`. Comments dispatch no events, but they:

- **keep the connection open:** proxies and load balancers close idle connections (nginx `proxy_read_timeout` and the AWS ALB idle timeout both default to 60 s);
- **let the client detect a dead connection:** every byte resets the client's `heartbeatTimeout` (fetch transport only). A server that pings every 15 s pairs with `new SseHandler(url, evem, { heartbeatTimeout: 45_000 })`: if nothing arrives for 45 s, for example because a proxy stopped forwarding, the client reconnects and resumes;
- **free resources sooner:** WSGI servers and `http.server` only notice that a client went away when a write fails, so pings limit how long a dead stream holds a thread.

A ping every 15 s, with a client `heartbeatTimeout` 2–3 times that, is a good default. The examples only ping when the next event is more than `HEARTBEAT_SECONDS` away, because events reset the timeout too.

## Native EventSource clients

With `transport: 'eventsource'`, the browser's `EventSource` only delivers the named events listed in `eventTypes`. Instead of keeping that list in sync with the server, send envelopes:

```python
>>> format_sse_message("order.updated", {"id": 7}, id=8, envelope=True)
'id: 8\ndata: {"event":"order.updated","data":{"id":7}}\n\n'

```

This is an unnamed message, which `EventSource` always delivers, and `SseHandler` unwraps it to `server.order.updated` (`unwrapEnvelope`, the default). The fetch transport routes envelopes the same way, so one server works with both transports.

Other limits of `EventSource` that affect the server:

- **No custom headers:** authenticate with cookies (sent automatically on the same origin; cross-origin they need `withCredentials: true`, see [CORS](#cors-with-credentials)) or with a token in the URL.
- **Resuming:** read the `lastEventId` query parameter as well as the header (see above).

## Deployment

### Workers and processes

Every open stream is a request that never finishes:

- **ASGI (FastAPI, Starlette) under uvicorn:** one event loop serves many streams. For several processes, use `uvicorn --workers N` or gunicorn with a uvicorn worker class.
- **WSGI (Flask):** every stream holds a thread.
  - With gunicorn, use threaded or async workers: `gunicorn --worker-class gthread --threads 100 app:app`, or gevent.
  - Avoid the default `sync` worker: it serves one request at a time, and kills a stream after `--timeout` seconds (30 by default) with `WORKER TIMEOUT`.
- **Graceful shutdown:** open streams block it.
  - On SIGTERM, uvicorn waits for open streams to close, indefinitely unless you pass `--timeout-graceful-shutdown 5`. With it, the generators are cancelled and their `finally` blocks run.
  - gunicorn stops waiting after `--graceful-timeout` (30 s by default).

  Cutting streams during a deploy is fine: clients reconnect and resume with `Last-Event-ID`.
- **Several processes:** an event published in one process only reaches the streams that process serves. Broadcast through something shared, such as Redis pub/sub or PostgreSQL `LISTEN`/`NOTIFY`.

### Proxies and timeouts

nginx buffers proxied responses by default, so clients would receive events in bursts. `X-Accel-Buffering: no` (part of `SSE_HEADERS`) turns buffering off for the response; a location for streams typically also has:

```nginx
location /events {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

- **Idle timeouts** (nginx `proxy_read_timeout`, load balancers, CDNs) close quiet streams. Keep the heartbeat interval well below the shortest one between client and server.
- **Total request timeouts** (some platforms and gateways cap how long a response may last) end streams no matter what. The client reconnects and resumes, which is fine if the cap is minutes rather than seconds.
- **Compression:** don't compress `text/event-stream`. In nginx, leave it out of `gzip_types`. Recent versions of Starlette's `GZipMiddleware` skip it, and `Cache-Control: no-transform` asks proxies not to.
- **HTTP/2:** over HTTP/1.1, browsers open at most about 6 connections per origin (across all tabs), and each stream holds one of them for as long as it's open. Serve streams over HTTP/2, where they share one connection.

### CORS with credentials

When the page and the stream are on different origins:

- **Cookies:** `withCredentials: true` on `SseHandler` sends cookies. The response must then have `Access-Control-Allow-Credentials: true` and an `Access-Control-Allow-Origin` with the exact origin (`*` doesn't work with credentials).
- **Preflights:** with the fetch transport, `Authorization` and `Last-Event-ID` (sent on reconnects) aren't CORS-safelisted headers. The browser sends a preflight `OPTIONS` request first, so allow them in `Access-Control-Allow-Headers`.
- **`Retry-After`:** the fetch transport reads it on error responses such as 429 or 503. Cross-origin, the browser only shows it to the client with `Access-Control-Expose-Headers: Retry-After`.

FastAPI:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],  # exact origins: "*" doesn't work with credentials
    allow_credentials=True,
    allow_headers=["Authorization", "Last-Event-ID"],
    expose_headers=["Retry-After"],
)
```

Flask, with `pip install flask-cors`:

```python
from flask_cors import CORS

CORS(
    app,
    origins=["https://app.example.com"],
    supports_credentials=True,
    allow_headers=["Authorization", "Last-Event-ID"],
    expose_headers=["Retry-After"],
)
```

## Testing

`tests/sse/python.test.ts` checks the Python side against the JavaScript one. It's skipped when `python3` isn't installed:

- **Same output:** `evem_sse.py` and the JS helper format the same handwritten and generated inputs, and the outputs must be identical. Both must also reject the same invalid inputs, and the [differences](#differences-from-the-javascript-helper) are pinned down.
- **Round trip:** the Python output goes through `SseParser` and `SseHandler` and comes back as the original data, under the event names in the [routing table](#how-the-client-routes-what-you-send).
- **Integration:** the test starts `server.py --drop-after 3` and connects `SseHandler`. Every tick must arrive exactly once and in order across the dropped connection. It also checks the headers, `retry:`, heartbeats, the query parameter, and that the server notices the client's disconnect.
- **This guide:** its `>>>` examples run as doctests.

To check your own endpoint, `curl -N` prints the raw stream (`-N` turns off curl's buffering):

```bash
curl -N -H 'Last-Event-ID: 41' http://127.0.0.1:8000/events
```
