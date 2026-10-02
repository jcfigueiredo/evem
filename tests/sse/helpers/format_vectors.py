"""Format SSE test vectors with examples/python/evem_sse.py, for tests/sse/python.test.ts.

Usage: python3 format_vectors.py <directory containing evem_sse.py> < vectors.json

stdin is a JSON list of vectors:
- {"message": {...}, "options": {...}} calls format_sse_message(**message, **options)
- {"comment": "text"} calls format_sse_comment("text"); {"comment": null} calls format_sse_comment()

stdout is {"headers": SSE_HEADERS, "results": [...]}, with {"output": "..."} or
{"error": "<exception class>", "message": "..."} per vector, in order.
"""

import json
import sys

sys.path.insert(0, sys.argv[1])

from evem_sse import SSE_HEADERS, format_sse_comment, format_sse_message  # noqa: E402


def run(vector):
    try:
        if "comment" in vector:
            text = vector["comment"]
            return {"output": format_sse_comment() if text is None else format_sse_comment(text)}
        return {"output": format_sse_message(**vector["message"], **vector.get("options", {}))}
    except (TypeError, ValueError) as error:
        return {"error": type(error).__name__, "message": str(error)}


vectors = json.loads(sys.stdin.buffer.read().decode("utf-8"))
sys.stdout.write(json.dumps({"headers": SSE_HEADERS, "results": [run(vector) for vector in vectors]}))
