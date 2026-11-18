"""Strict local HTTP/SSE wire-protocol server for testing real OpenAI, Anthropic, Google, Ollama & HF SDKs."""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, List, Optional

FORBIDDEN_AUREX_WIRE_KEYS = {
    "workflow_id",
    "workflowId",
    "tags",
    "quality_score",
    "qualityScore",
    "tenant_id",
    "tenantId",
    "extra_metadata",
}
NON_REASONING_MODELS = {"gpt-4o-mini", "gpt-4.1-nano", "claude-3-5-haiku", "gemini-2.0-flash", "gemini-2.5-flash-lite"}


class WireServer:
    """Ephemeral loopback HTTP/1.1 + SSE server enforcing real upstream provider wire schemas."""

    def __init__(self) -> None:
        self.requests: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._queue: List[Dict[str, Any]] = []
        self._custom_handler: Optional[Callable[[str, Dict[str, str], Dict[str, Any]], Optional[Dict[str, Any]]]] = None
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), self._make_handler())
        self.port: int = self._server.server_address[1]
        self.base_url: str = f"http://127.0.0.1:{self.port}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def start(self) -> "WireServer":
        self._thread.start()
        return self

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=2.0)

    def reset(self) -> None:
        with self._lock:
            self.requests.clear()
            self._queue.clear()
            self._custom_handler = None

    def enqueue(self, spec: Dict[str, Any]) -> None:
        with self._lock:
            self._queue.append(spec)

    def set_handler(self, fn: Callable[[str, Dict[str, str], Dict[str, Any]], Optional[Dict[str, Any]]]) -> None:
        with self._lock:
            self._custom_handler = fn

    def _pop_spec(self, path: str, headers: Dict[str, str], body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        with self._lock:
            if self._custom_handler is not None:
                res = self._custom_handler(path, headers, body)
                if res is not None:
                    return res
            if self._queue:
                return self._queue.pop(0)
        return None

    def _validate_strict_wire(self, path: str, body: Dict[str, Any]) -> Optional[str]:
        leaked = FORBIDDEN_AUREX_WIRE_KEYS.intersection(body.keys())
        if leaked:
            return f"Unrecognized Aurex parameter leaked onto wire: {sorted(leaked)}"

        if "/messages" in path and "metadata" in body:
            meta = body["metadata"]
            if not isinstance(meta, dict) or set(meta.keys()) - {"user_id"}:
                return f"Anthropic metadata only permits 'user_id', got: {list(meta.keys()) if isinstance(meta, dict) else meta}"

        if ":generateContent" in path or ":streamGenerateContent" in path:
            if "metadata" in body:
                return "Google Gemini generateContent does not accept top-level 'metadata'"

        model = str(body.get("model") or "")
        if model in NON_REASONING_MODELS:
            for rk in ("reasoning_effort", "reasoning", "thinking"):
                if body.get(rk) is not None:
                    return f"Model '{model}' does not support reasoning parameter '{rk}'"
        return None

    def _make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, format: str, *args: Any) -> None:
                return

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", "0") or "0")
                raw = self.rfile.read(length) if length > 0 else b"{}"
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception:
                    body = {}

                hdrs = {k.lower(): v for k, v in self.headers.items()}
                with outer._lock:
                    outer.requests.append({"path": self.path, "headers": hdrs, "body": body})

                err_msg = outer._validate_strict_wire(self.path, body)
                if err_msg:
                    self._send_json(400, {"error": {"message": err_msg, "type": "invalid_request_error"}})
                    return

                spec = outer._pop_spec(self.path, hdrs, body) or {}
                status = int(spec.get("status", 200))
                if "delay_sec" in spec:
                    time.sleep(float(spec["delay_sec"]))

                if status >= 400:
                    payload = spec.get("json") or {"error": {"message": spec.get("error_message", f"HTTP {status}"), "type": "api_error"}}
                    self._send_json(status, payload, extra_headers=spec.get("headers"))
                    return

                is_stream = bool(body.get("stream")) or "streamGenerateContent" in self.path or spec.get("sse") is not None
                if is_stream:
                    self._send_sse(body, spec)
                else:
                    payload = spec.get("json") or outer._default_json(self.path, body)
                    self._send_json(200, payload, extra_headers=spec.get("headers"))

            def _send_json(self, code: int, payload: Dict[str, Any], extra_headers: Optional[Dict[str, str]] = None) -> None:
                encoded = json.dumps(payload).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                for hk, hv in (extra_headers or {}).items():
                    self.send_header(hk, hv)
                self.end_headers()
                self.wfile.write(encoded)
                self.wfile.flush()

            def _write_chunk(self, data: bytes) -> None:
                self.wfile.write(f"{len(data):X}\r\n".encode("ascii") + data + b"\r\n")
                self.wfile.flush()

            def _send_sse(self, req_body: Dict[str, Any], spec: Dict[str, Any]) -> None:
                events = spec.get("sse") or outer._default_sse(self.path, req_body)
                abort_after = spec.get("abort_after_chunks")
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Transfer-Encoding", "chunked")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()

                for idx, ev in enumerate(events):
                    if abort_after is not None and idx >= int(abort_after):
                        self.close_connection = True
                        return
                    if isinstance(ev, str):
                        line = f"data: {ev}\n\n".encode("utf-8")
                    elif "event" in ev:
                        line = f"event: {ev['event']}\ndata: {json.dumps(ev['data'])}\n\n".encode("utf-8")
                    else:
                        line = f"data: {json.dumps(ev)}\n\n".encode("utf-8")
                    self._write_chunk(line)

                if "/chat/completions" in self.path:
                    self._write_chunk(b"data: [DONE]\n\n")
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()

        return Handler

    def _default_json(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        model = body.get("model", "gpt-4o")
        if "/messages" in path:
            return {
                "id": "msg_wire_default",
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": [{"type": "text", "text": "Anthropic wire OK"}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 120, "output_tokens": 24, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0},
            }
        if "/responses" in path:
            return {
                "id": "resp_wire_default",
                "object": "response",
                "created_at": 1763470000,
                "status": "completed",
                "model": model,
                "output": [{"type": "message", "id": "m1", "status": "completed", "role": "assistant", "content": [{"type": "output_text", "text": "Responses wire OK", "annotations": []}]}],
                "usage": {"input_tokens": 150, "input_tokens_details": {"cached_tokens": 64}, "output_tokens": 30, "output_tokens_details": {"reasoning_tokens": 0}, "total_tokens": 180},
            }
        if ":generateContent" in path:
            return {
                "candidates": [{"content": {"role": "model", "parts": [{"text": "Gemini wire OK"}]}, "finishReason": "STOP", "index": 0}],
                "usageMetadata": {"promptTokenCount": 200, "candidatesTokenCount": 25, "thoughtsTokenCount": 15, "cachedContentTokenCount": 50, "totalTokenCount": 240},
            }
        if "/api/chat" in path or "/api/generate" in path:
            return {
                "model": model,
                "created_at": "2026-11-18T12:00:00Z",
                "message": {"role": "assistant", "content": "Ollama wire OK"},
                "response": "Ollama wire OK",
                "done": True,
                "prompt_eval_count": 64,
                "eval_count": 18,
            }
        return {
            "id": "chatcmpl_wire_default",
            "object": "chat.completion",
            "created": 1763470000,
            "model": model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "OpenAI wire OK"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 110, "completion_tokens": 20, "total_tokens": 130, "prompt_tokens_details": {"cached_tokens": 0}, "completion_tokens_details": {"reasoning_tokens": 0}},
        }

    def _default_sse(self, path: str, body: Dict[str, Any]) -> List[Any]:
        model = body.get("model", "gpt-4o")
        if "/messages" in path:
            return [
                {"event": "message_start", "data": {"type": "message_start", "message": {"id": "msg_s1", "type": "message", "role": "assistant", "model": model, "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 80, "output_tokens": 1, "cache_read_input_tokens": 400, "cache_creation_input_tokens": 100}}}},
                {"event": "content_block_start", "data": {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}},
                {"event": "content_block_delta", "data": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello "}}},
                {"event": "content_block_delta", "data": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Claude SSE"}}},
                {"event": "content_block_stop", "data": {"type": "content_block_stop", "index": 0}},
                {"event": "message_delta", "data": {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 42}}},
                {"event": "message_stop", "data": {"type": "message_stop"}},
            ]
        if "/responses" in path:
            return [
                {"event": "response.created", "data": {"type": "response.created", "response": {"id": "resp_s1", "object": "response", "status": "in_progress", "model": model, "output": []}}},
                {"event": "response.output_text.delta", "data": {"type": "response.output_text.delta", "item_id": "m1", "output_index": 0, "content_index": 0, "delta": "Streamed "}},
                {"event": "response.output_text.delta", "data": {"type": "response.output_text.delta", "item_id": "m1", "output_index": 0, "content_index": 0, "delta": "response."}},
                {"event": "response.completed", "data": {"type": "response.completed", "response": {"id": "resp_s1", "object": "response", "status": "completed", "model": model, "output": [{"type": "message", "id": "m1", "status": "completed", "role": "assistant", "content": [{"type": "output_text", "text": "Streamed response.", "annotations": []}]}], "usage": {"input_tokens": 310, "input_tokens_details": {"cached_tokens": 128}, "output_tokens": 55, "output_tokens_details": {"reasoning_tokens": 20}, "total_tokens": 365}}}},
            ]
        if "streamGenerateContent" in path:
            return [
                {"candidates": [{"content": {"role": "model", "parts": [{"text": "Gemini "}]}, "index": 0}]},
                {"candidates": [{"content": {"role": "model", "parts": [{"text": "stream OK"}]}, "finishReason": "STOP", "index": 0}], "usageMetadata": {"promptTokenCount": 180, "candidatesTokenCount": 30, "thoughtsTokenCount": 25, "cachedContentTokenCount": 40, "totalTokenCount": 235}},
            ]
        chunks: List[Any] = [
            {"id": "c1", "object": "chat.completion.chunk", "created": 1763470000, "model": model, "choices": [{"index": 0, "delta": {"role": "assistant", "content": "Hello "}, "finish_reason": None}], "usage": None},
            {"id": "c1", "object": "chat.completion.chunk", "created": 1763470000, "model": model, "choices": [{"index": 0, "delta": {"content": "OpenAI SSE"}, "finish_reason": "stop"}], "usage": None},
        ]
        if isinstance(body.get("stream_options"), dict) and body["stream_options"].get("include_usage"):
            chunks.append(
                {"id": "c1", "object": "chat.completion.chunk", "created": 1763470000, "model": model, "choices": [], "usage": {"prompt_tokens": 145, "completion_tokens": 28, "total_tokens": 173, "prompt_tokens_details": {"cached_tokens": 64}, "completion_tokens_details": {"reasoning_tokens": 0}}}
            )
        return chunks
