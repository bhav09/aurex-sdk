"""Dependency-inverted workflow state store shared across Stages 1, 2, and 3."""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Dict, List, Optional, Protocol


def resolve_workflow_id(
    explicit_id: Optional[str] = None,
    ctx: Optional[Dict[str, Any]] = None,
) -> str:
    """Resolve workflow_id cleanly: explicit -> contextvars -> OTel trace_id -> env -> default."""
    if explicit_id and explicit_id != "default_workflow":
        return explicit_id
    if ctx and ctx.get("workflow_id"):
        return str(ctx["workflow_id"])

    # Auto-detect active OpenTelemetry trace_id if opentelemetry-api is installed
    try:
        from opentelemetry import trace  # type: ignore

        span = trace.get_current_span()
        span_ctx = span.get_span_context() if span else None
        if span_ctx and getattr(span_ctx, "is_valid", False) and getattr(span_ctx, "trace_id", 0):
            return f"otel_{span_ctx.trace_id:032x}"
    except Exception:
        pass

    env_wf = os.environ.get("AUREX_WORKFLOW_ID")
    if env_wf:
        return env_wf
    return explicit_id or "default_workflow"


class StateStore(Protocol):
    """Minimal interface shared by Pre-Call Shield (S1), Circuit Breaker (S2), and Policy Sync (S3)."""

    def get_prefix_state(self, workflow_id: str) -> Optional[Dict[str, Any]]: ...
    def set_prefix_state(self, workflow_id: str, state: Dict[str, Any]) -> None: ...
    def add_spend(self, workflow_id: str, cost: float, now: Optional[float] = None) -> None: ...
    def get_spend_summary(self, workflow_id: str, now: Optional[float] = None) -> Dict[str, float]: ...
    def get_policy(self, key: str) -> Optional[Dict[str, Any]]: ...
    def set_policy(self, key: str, policy: Dict[str, Any]) -> None: ...
    def clear(self) -> None: ...


class InMemoryStateStore:
    """Thread-safe bounded in-memory StateStore (default for local & single-worker runs)."""

    def __init__(self, max_workflows: int = 2000):
        self._lock = threading.Lock()
        self._max_workflows = max_workflows
        self._prefix_states: Dict[str, Dict[str, Any]] = {}
        self._session_costs: Dict[str, float] = {}
        self._minute_events: List[Dict[str, float]] = []
        self._policies: Dict[str, Dict[str, Any]] = {}

    def get_prefix_state(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            state = self._prefix_states.get(workflow_id)
            return dict(state) if state else None

    def set_prefix_state(self, workflow_id: str, state: Dict[str, Any]) -> None:
        with self._lock:
            if workflow_id not in self._prefix_states and len(self._prefix_states) >= self._max_workflows:
                oldest_key = next(iter(self._prefix_states))
                self._prefix_states.pop(oldest_key, None)
            self._prefix_states[workflow_id] = dict(state)

    def add_spend(self, workflow_id: str, cost: float, now: Optional[float] = None) -> None:
        ts = now if now is not None else time.time()
        with self._lock:
            self._minute_events = [e for e in self._minute_events if ts - e["timestamp"] < 60.0]
            self._minute_events.append({"timestamp": ts, "cost": float(cost)})
            if workflow_id:
                if workflow_id not in self._session_costs and len(self._session_costs) >= self._max_workflows:
                    oldest_wf = next(iter(self._session_costs))
                    self._session_costs.pop(oldest_wf, None)
                self._session_costs[workflow_id] = self._session_costs.get(workflow_id, 0.0) + float(cost)

    def get_spend_summary(self, workflow_id: str, now: Optional[float] = None) -> Dict[str, float]:
        ts = now if now is not None else time.time()
        with self._lock:
            self._minute_events = [e for e in self._minute_events if ts - e["timestamp"] < 60.0]
            return {
                "session_cost": self._session_costs.get(workflow_id, 0.0) if workflow_id else 0.0,
                "minute_cost": sum(e["cost"] for e in self._minute_events),
                "minute_requests": float(len(self._minute_events)),
            }

    def get_policy(self, key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            p = self._policies.get(key)
            return dict(p) if p else None

    def set_policy(self, key: str, policy: Dict[str, Any]) -> None:
        with self._lock:
            self._policies[key] = dict(policy)

    def clear(self) -> None:
        with self._lock:
            self._prefix_states.clear()
            self._session_costs.clear()
            self._minute_events.clear()
            self._policies.clear()


class RedisStateStore:
    """Multi-worker Redis/Valkey StateStore with automatic fail-open fallback to InMemoryStateStore."""

    def __init__(
        self,
        redis_url: Optional[str] = None,
        namespace: str = "aurex",
        ttl_seconds: int = 7200,
        redis_client: Optional[Any] = None,
    ):
        self._fallback = InMemoryStateStore()
        self._ns = namespace
        self._ttl = ttl_seconds
        self._client: Any = redis_client
        if self._client is None and redis_url:
            try:
                import redis  # type: ignore

                self._client = redis.Redis.from_url(
                    redis_url, decode_responses=True, socket_connect_timeout=0.5, socket_timeout=0.5
                )
            except Exception:
                self._client = None

    def get_prefix_state(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        if self._client is not None:
            try:
                raw = self._client.get(f"{self._ns}:prefix:{workflow_id}")
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        return self._fallback.get_prefix_state(workflow_id)

    def set_prefix_state(self, workflow_id: str, state: Dict[str, Any]) -> None:
        self._fallback.set_prefix_state(workflow_id, state)
        if self._client is not None:
            try:
                self._client.setex(f"{self._ns}:prefix:{workflow_id}", self._ttl, json.dumps(state))
            except Exception:
                pass

    def add_spend(self, workflow_id: str, cost: float, now: Optional[float] = None) -> None:
        ts = now if now is not None else time.time()
        self._fallback.add_spend(workflow_id, cost, ts)
        if self._client is not None:
            try:
                pipe = self._client.pipeline()
                if workflow_id:
                    s_key = f"{self._ns}:session_cost:{workflow_id}"
                    pipe.incrbyfloat(s_key, float(cost))
                    pipe.expire(s_key, self._ttl)
                bucket = int(ts // 60)
                m_cost_key = f"{self._ns}:min_cost:{bucket}"
                m_req_key = f"{self._ns}:min_reqs:{bucket}"
                pipe.incrbyfloat(m_cost_key, float(cost))
                pipe.expire(m_cost_key, 120)
                pipe.incr(m_req_key)
                pipe.expire(m_req_key, 120)
                pipe.execute()
            except Exception:
                pass

    def get_spend_summary(self, workflow_id: str, now: Optional[float] = None) -> Dict[str, float]:
        ts = now if now is not None else time.time()
        if self._client is not None:
            try:
                bucket = int(ts // 60)
                s_val, m_cost, m_reqs = self._client.mget(
                    f"{self._ns}:session_cost:{workflow_id}" if workflow_id else f"{self._ns}:none",
                    f"{self._ns}:min_cost:{bucket}",
                    f"{self._ns}:min_reqs:{bucket}",
                )
                return {
                    "session_cost": float(s_val or 0.0),
                    "minute_cost": float(m_cost or 0.0),
                    "minute_requests": float(m_reqs or 0.0),
                }
            except Exception:
                pass
        return self._fallback.get_spend_summary(workflow_id, ts)

    def get_policy(self, key: str) -> Optional[Dict[str, Any]]:
        if self._client is not None:
            try:
                raw = self._client.get(f"{self._ns}:policy:{key}")
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        return self._fallback.get_policy(key)

    def set_policy(self, key: str, policy: Dict[str, Any]) -> None:
        self._fallback.set_policy(key, policy)
        if self._client is not None:
            try:
                self._client.setex(f"{self._ns}:policy:{key}", self._ttl, json.dumps(policy))
            except Exception:
                pass

    def clear(self) -> None:
        self._fallback.clear()


def build_state_store(redis_url: Optional[str] = None, redis_client: Optional[Any] = None) -> StateStore:
    if redis_client is not None:
        return RedisStateStore(redis_client=redis_client)
    resolved_url = redis_url or os.environ.get("AUREX_REDIS_URL")
    if resolved_url:
        return RedisStateStore(resolved_url)
    return InMemoryStateStore()
