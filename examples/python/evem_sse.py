"""Server-Sent Events formatting for evem clients: the Python version of
``@jcfigueiredo/evem/sse/server``.

Copy this file into your project. It needs only the standard library (Python 3.8+), does no
I/O, and writes the same text as the JavaScript ``formatSseMessage`` / ``formatSseComment`` for
the same JSON values, so servers in either language look the same to ``SseHandler``.

>>> format_sse_message("order.updated", {"id": 7, "status": "shipped"}, id=42)
'event: order.updated\\nid: 42\\ndata: {"id":7,"status":"shipped"}\\n\\n'
>>> format_sse_message(data="hello")
'data: "hello"\\n\\n'
>>> format_sse_message(data="line one\\nline two", raw=True)
'data: line one\\ndata: line two\\n\\n'
>>> format_sse_message("refresh")
'event: refresh\\ndata: null\\n\\n'
>>> format_sse_message(retry=5000)
'retry: 5000\\n\\n'
>>> format_sse_message("order.updated", {"id": 7}, id="3", envelope=True)
'id: 3\\ndata: {"event":"order.updated","data":{"id":7}}\\n\\n'
>>> format_sse_comment("ping")
': ping\\n\\n'
"""

import json
import re
from typing import Any, Dict, Optional, Union

__all__ = ["SSE_HEADERS", "format_sse_comment", "format_sse_message"]

SSE_HEADERS: Dict[str, str] = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
}
"""Response headers for an SSE stream: the content type, no caching or transforms (which would
buffer or compress the stream), and no nginx buffering. ``Connection: keep-alive`` is left out on
purpose: HTTP/2 servers reject it. Copy before changing it: ``{**SSE_HEADERS, "X-Extra": "1"}``."""

# The line endings of the event stream format. Not str.splitlines(), which also splits on
# \v, \f, \x1c-\x1e, \x85, \u2028 and \u2029: the client keeps those as part of the line.
_LINE_BREAK = re.compile(r"\r\n|\r|\n")
_SURROGATE = re.compile("[\ud800-\udfff]")
_MAX_RETRY = 2**53 - 1

_OMITTED: Any = object()
"""Default for ``data``: no data given (``None`` is sent as JSON ``null``)."""


def _assert_single_line(field: str, value: str) -> None:
    if "\r" in value or "\n" in value:
        raise ValueError(f"SSE {field} must not contain line breaks: {value!r}")


def _to_json(value: Any) -> str:
    """Encode like JavaScript's ``JSON.stringify``: compact, non-ASCII characters kept as they are,
    and lone surrogates (which can't be encoded as UTF-8) escaped as ``\\udxxx``."""
    text = json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return _SURROGATE.sub(lambda match: "\\u%04x" % ord(match.group()), text)


def format_sse_message(
    event: Optional[str] = None,
    data: Any = _OMITTED,
    id: Optional[Union[str, int]] = None,  # noqa: A002 - the SSE field's name
    retry: Optional[int] = None,
    *,
    raw: bool = False,
    envelope: bool = False,
) -> str:
    """Format one SSE message, ending with the blank line that dispatches it.

    Args:
        event: Event type. The client publishes it as ``<serverEventPrefix>.<event>``
            (``order.updated`` becomes ``server.order.updated``).
        data: Payload, JSON-encoded (strings included), which matches the client's default
            ``parseData: 'json'``. Every line gets its own ``data:`` field, so the content can
            never end the event early or add other fields. ``None`` is sent as ``null``; a named
            event without ``data`` is sent with ``data: null``, because the client never
            dispatches an event without data. With neither ``event`` nor ``data``, only ``id``
            and ``retry`` are written.
        id: Event id; the client sends the last one back as ``Last-Event-ID`` when it reconnects.
        retry: Reconnection delay for the client, in milliseconds.
        raw: Write string data as text, one ``data:`` line per line, for clients using
            ``parseData: 'text'``. Data that isn't a ``str`` is still JSON-encoded.
        envelope: Write an unnamed message whose data is ``{"event": event, "data": data}``, so
            clients using the native EventSource receive it without listing every event type.

    Returns:
        The message as text; encode it as UTF-8 to send it.

    Raises:
        ValueError: If ``event`` or ``id`` contains a line break, ``id`` contains NUL, ``retry``
            isn't an ``int`` from 0 to 2**53 - 1, ``envelope`` is set without an ``event``, or ``data``
            contains NaN or infinity. (The JavaScript helper throws TypeError / RangeError.)
        TypeError: If ``event`` isn't a ``str``, ``id`` isn't a ``str`` or ``int``, or ``data``
            can't be JSON-encoded.
    """
    lines = []

    if event is not None:
        if not isinstance(event, str):
            raise TypeError(f"SSE event must be a str, got {type(event).__name__}")
        _assert_single_line("event", event)
    if envelope and not event:
        raise ValueError("SSE envelope messages need an event name")

    if event and not envelope:
        lines.append(f"event: {event}")

    if id is not None:
        if isinstance(id, bool) or not isinstance(id, (str, int)):
            raise TypeError(f"SSE id must be a str or int, got {type(id).__name__}")
        id_text = str(int(id)) if isinstance(id, int) else id
        _assert_single_line("id", id_text)
        if "\0" in id_text:
            raise ValueError("SSE id must not contain NULL characters")
        lines.append(f"id: {id_text}")

    if retry is not None:
        # Same limit as JavaScript's Number.MAX_SAFE_INTEGER, so both helpers reject the same values
        if isinstance(retry, bool) or not isinstance(retry, int) or not 0 <= retry <= _MAX_RETRY:
            raise ValueError(f"SSE retry must be a non-negative integer up to 2**53 - 1, got {retry!r}")
        lines.append(f"retry: {int(retry)}")

    if event or data is not _OMITTED:
        if envelope:
            payload = {"event": event, "data": None if data is _OMITTED else data}
        else:
            payload = None if data is _OMITTED else data
        text = payload if raw and isinstance(payload, str) else _to_json(payload)
        lines.extend(f"data: {line}" for line in _LINE_BREAK.split(text))

    return "\n".join(lines) + "\n\n"


def format_sse_comment(text: str = "") -> str:
    """Format a comment, e.g. a heartbeat (``: ping``). Clients ignore comments, but receiving
    them keeps the client's ``heartbeatTimeout`` from firing (and proxies from closing an idle
    connection).

    >>> format_sse_comment("two\\nlines")
    ': two\\n: lines\\n\\n'
    >>> format_sse_comment()
    ':\\n\\n'
    """
    lines = [f": {line}" if line else ":" for line in _LINE_BREAK.split(text)]
    return "\n".join(lines) + "\n\n"
