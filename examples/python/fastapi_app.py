"""SSE endpoint for evem clients with FastAPI (the same code works with plain Starlette).

    pip install fastapi uvicorn
    uvicorn fastapi_app:app --port 8000      # evem_sse.py next to this file

Streams numbered ``tick`` events like ``server.py``: the client publishes them as ``server.tick``
and resumes after a reconnect from ``Last-Event-ID`` (or the ``lastEventId`` query parameter).
"""

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
