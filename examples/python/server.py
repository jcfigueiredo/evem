#!/usr/bin/env python3
"""A runnable SSE server for evem clients, using only the standard library (Python 3.8+).

It streams numbered ``tick`` events on ``/events``: ``{"n": 1}``, ``{"n": 2}``, ... Each event's
id is its number, so a client that reconnects with ``Last-Event-ID: 41`` continues at 42.
The id is read from the ``Last-Event-ID`` header (sent by ``SseHandler``'s fetch transport and by
the browser's own EventSource reconnects) or from the ``lastEventId`` query parameter (used when
``SseHandler`` creates a new native EventSource).

    python3 server.py --port 8000

    // in the client
    const sse = new SseHandler('http://127.0.0.1:8000/events', evem);
    evem.subscribe('server.tick', ({ n }) => console.log(n));

The first line on stdout is the port (useful with ``--port 0``); the log goes to stderr.
``--drop-after N`` ends the first connection after N events, to show the client resuming.
"""

import argparse
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import parse_qs, urlsplit

from evem_sse import SSE_HEADERS, format_sse_comment, format_sse_message


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def resume_after(header: Optional[str], query: Optional[str]) -> int:
    """The number of the last event the client received, 0 if none.

    The header wins: a native EventSource that reconnects by itself keeps the URL it was created
    with (including an old ``lastEventId``) and sends the newer id in the header.
    """
    for value in (header, query):
        if value and re.fullmatch(r"[0-9]+", value):
            return int(value)
    return 0


class TickServer(ThreadingHTTPServer):
    """One thread per connection; settings come from the command line."""

    def __init__(self, address, args: argparse.Namespace) -> None:
        super().__init__(address, TickHandler)
        self.args = args
        self.connections = 0
        self.lock = threading.Lock()

    def next_connection(self) -> int:
        with self.lock:
            self.connections += 1
            return self.connections


class TickHandler(BaseHTTPRequestHandler):
    server: TickServer

    def do_GET(self) -> None:  # noqa: N802 - the name BaseHTTPRequestHandler calls
        url = urlsplit(self.path)
        if url.path != "/events":
            self.send_error(404)
            return

        query = parse_qs(url.query).get("lastEventId", [None])[0]
        last = resume_after(self.headers.get("Last-Event-ID"), query)
        connection = self.server.next_connection()
        args = self.server.args
        drop_after = args.drop_after if connection == 1 else None

        log(f"connection {connection}: resuming after {last}")
        try:
            self.send_response(200)
            for name, value in SSE_HEADERS.items():
                self.send_header(name, value)
            self.end_headers()
            last = self.stream(last, drop_after)
            log(f"connection {connection}: ended by the server after {last}")
        except ConnectionError:  # BrokenPipeError, ConnectionResetError, ...
            # The client went away; we only find out when a write fails, which the heartbeat
            # guarantees happens at least every --heartbeat seconds
            log(f"connection {connection}: client disconnected")

    def stream(self, last: int, drop_after: Optional[int]) -> int:
        """Send ticks after ``last`` (and heartbeats between them) until the client disconnects,
        or until ``drop_after`` ticks were sent. Returns the last tick sent."""
        args = self.server.args
        self.send(format_sse_message(retry=args.retry))
        sent = 0
        next_tick = time.monotonic()
        while drop_after is None or sent < drop_after:
            wait = next_tick - time.monotonic()
            if wait > args.heartbeat:
                # Nothing to send for a while: a comment keeps proxies and the client's
                # heartbeatTimeout from treating the connection as dead
                time.sleep(args.heartbeat)
                self.send(format_sse_comment("ping"))
                continue
            time.sleep(max(0.0, wait))
            last += 1
            self.send(format_sse_message("tick", {"n": last}, id=last))
            sent += 1
            next_tick += args.interval
        return last

    def send(self, text: str) -> None:
        self.wfile.write(text.encode("utf-8"))
        self.wfile.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description="Stream numbered SSE tick events on /events")
    parser.add_argument("--host", default="127.0.0.1", help="interface to listen on (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="port to listen on; 0 picks a free one (default 8000)")
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between ticks (default 1)")
    parser.add_argument("--heartbeat", type=float, default=15.0, help="seconds of silence before a ': ping' comment (default 15)")
    parser.add_argument("--retry", type=int, default=1000, help="reconnection delay sent to clients, in ms (default 1000)")
    parser.add_argument("--drop-after", type=int, metavar="N", help="end the first connection after N events")
    args = parser.parse_args()

    server = TickServer((args.host, args.port), args)
    host, port = server.server_address[:2]
    print(port, flush=True)
    log(f"Streaming ticks on http://{host}:{port}/events")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
