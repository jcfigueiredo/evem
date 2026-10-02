"""SSE endpoint for evem clients with Flask.

    pip install flask
    flask --app flask_app run --port 8000    # evem_sse.py next to this file

Streams numbered ``tick`` events like ``server.py``: the client publishes them as ``server.tick``
and resumes after a reconnect from ``Last-Event-ID`` (or the ``lastEventId`` query parameter).
Each open stream holds a worker thread: see the deployment notes in docs/sse-python.md.
"""

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
