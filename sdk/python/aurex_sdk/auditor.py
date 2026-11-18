import os
import sys
import json
import queue
import threading
import time
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple, Literal, Set
import urllib.request
import urllib.error
from aurex_sdk.decisions import AurexDecision, AurexAction, suggest_cheaper_model, is_expensive_model, compress_messages, apply_decision_to_call_params
from aurex_sdk.semantic import jaccard_ngram_similarity
from aurex_sdk.cloud_sync import sync_batch_with_retry
from aurex_sdk.exceptions import AurexBlocked, AurexBudgetExceeded, AurexResilienceExhausted
from aurex_sdk.ledger_utils import emit_warning_once, prepare_ledger_storage
from aurex_sdk.resilience import (
    AttemptRecord,
    ResiliencePolicy,
    async_execute_with_resilience,
    detect_grammar_loop,
    execute_with_resilience,
    parse_resilience_config,
)
from aurex_sdk.loop_guard import LoopGuard
from aurex_sdk.prefix_shield import inspect_pre_call_shield
from aurex_sdk.pricing import (
    MODEL_PRICING,
    calculate_cost as _core_calculate_cost,
    count_request_tokens,
    extract_provider,
    get_model_pricing as _core_get_model_pricing,
    normalize_model_name,
)
from aurex_sdk.runtime_guard import (
    build_cached_response,
    disable_sdk_internal_retries,
    ensure_openai_stream_usage,
    extract_client_base_url,
    extract_responses_api_usage,
    normalize_responses_api_input,
    resolve_endpoint_provider,
)
from aurex_sdk.state_store import build_state_store, resolve_workflow_id


def get_model_pricing(model: str, provider: Optional[str] = None) -> Tuple[float, float]:
    dp = None
    if AurexAuditor._instance and getattr(AurexAuditor._instance, "config", None):
        dp = getattr(AurexAuditor._instance.config, "default_pricing", None)
    return _core_get_model_pricing(model, default_pricing=dp, provider=provider)


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    cache_write_tokens: int = 0,
    is_batch: bool = False,
    cache_ttl: str = "5m",
    provider: Optional[str] = None,
) -> float:
    dp = None
    if AurexAuditor._instance and getattr(AurexAuditor._instance, "config", None):
        dp = getattr(AurexAuditor._instance.config, "default_pricing", None)
        if cache_ttl == "5m":
            cache_ttl = getattr(AurexAuditor._instance.config, "cache_ttl", "5m") or "5m"
    return _core_calculate_cost(
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_tokens,
        cache_write_tokens=cache_write_tokens,
        is_batch=is_batch,
        cache_ttl=cache_ttl,
        default_pricing=dp,
        provider=provider,
    )
import contextvars
aurex_context: contextvars.ContextVar = contextvars.ContextVar("aurex_context", default={})

def extract_aurex_extra_params(kwargs: Dict[str, Any]) -> Tuple[Optional[Dict[str, str]], Optional[float], Optional[str]]:
    # Pop from top-level kwargs
    tags = kwargs.pop("tags", None)
    quality_score = kwargs.pop("quality_score", None)
    workflow_id = kwargs.pop("workflow_id", None)
    
    # Fallback to checking metadata dictionary if it exists
    metadata = kwargs.get("metadata")
    if isinstance(metadata, dict):
        if not tags:
            tags = metadata.get("tags")
        if quality_score is None:
            quality_score = metadata.get("quality_score")
        if not workflow_id:
            workflow_id = metadata.get("workflow_id")
            
    # Also support "user" as workflow_id fallback
    if not workflow_id:
        workflow_id = kwargs.get("user")
        
    # Context-local overrides fallback
    ctx = aurex_context.get()
    if not tags:
        tags = ctx.get("tags")
    if quality_score is None:
        quality_score = ctx.get("quality_score")
    if not workflow_id:
        workflow_id = ctx.get("workflow_id")
        
    return tags, quality_score, workflow_id

def create_mock_response(provider: str, response_text: str, model: str) -> Any:
    return build_cached_response(provider, response_text, model)

class AurexConfig:
    def __init__(
        self,
        api_key: Optional[str] = None,
        project: str = "default",
        ledger_path: str = ".aurex/ledger.jsonl",
        cloud_sync: bool = False,
        cloud_endpoint: Optional[str] = None,
        base_url: Optional[str] = None,
        flush_interval_seconds: float = 30.0,
        max_batch_size: int = 100,
        local_only: bool = True,
        storage_mode: str = "file", # "file" or "memory"
        budget_guard: Optional[Dict[str, Any]] = None,
        sync_prompt_hashes: bool = False,
        auto_downgrade_simple_prompts: bool = False,
        otel_export: bool = False,
        on_cache_hit: Optional[Any] = None,
        on_cache_miss: Optional[Any] = None,
        pricing_path: Optional[str] = None,
        default_pricing: Optional[Dict[str, float]] = None,
        simple_prompt_token_limit: int = 120,
        runaway_context_multiplier: float = 2.2,
        loop_similarity_threshold: float = 0.8,
        downgrade_map: Optional[Dict[str, str]] = None,
        max_queue_size: int = 10000,
        sync_timeout_seconds: float = 10.0,
        sync_max_retries: int = 3,
        per_process_ledger: bool = True,
        resilience: Optional[Dict[str, Any]] = None,
        enable_loop_guard: bool = False,
        enable_compression: bool = False,
        redis_url: Optional[str] = None,
        cache_ttl: str = "5m",
    ):
        self.api_key = api_key or os.getenv("AUREX_API_KEY")
        self.project = project
        self.ledger_path = ledger_path
        self.cloud_sync = cloud_sync
        self.sync_prompt_hashes = sync_prompt_hashes or (os.getenv("AUREX_SYNC_PROMPT_HASHES", "0") in ("1", "true", "True"))
        self.auto_downgrade_simple_prompts = auto_downgrade_simple_prompts
        self.otel_export = otel_export
        self.on_cache_hit = on_cache_hit
        self.on_cache_miss = on_cache_miss
        # Cloud target: explicit cloud_endpoint wins, else derive from base_url
        # (env: AUREX_BASE_URL), else fall back to localhost dev default.
        if cloud_endpoint:
            self.cloud_endpoint = cloud_endpoint
        else:
            resolved_base = (
                base_url
                or os.getenv("AUREX_BASE_URL")
                or "http://localhost:8000/api/v1"
            ).rstrip("/")
            self.cloud_endpoint = f"{resolved_base}/ledger/events"
        self.flush_interval_seconds = flush_interval_seconds
        self.max_batch_size = max_batch_size
        self.local_only = local_only
        self.storage_mode = storage_mode
        self.budget_guard = budget_guard or {}
        self.pricing_path = pricing_path or os.getenv("AUREX_PRICING_PATH")
        self.default_pricing = default_pricing
        self.simple_prompt_token_limit = simple_prompt_token_limit
        self.runaway_context_multiplier = runaway_context_multiplier
        self.loop_similarity_threshold = loop_similarity_threshold
        self.downgrade_map = downgrade_map or {}
        self.max_queue_size = max_queue_size
        self.sync_timeout_seconds = sync_timeout_seconds
        self.sync_max_retries = sync_max_retries
        self.per_process_ledger = per_process_ledger
        self.resilience = resilience or {}
        self.enable_loop_guard = enable_loop_guard
        self.enable_compression = enable_compression
        self.redis_url = redis_url or os.getenv("AUREX_REDIS_URL")
        self.cache_ttl = cache_ttl or os.getenv("AUREX_CACHE_TTL", "5m")


class AurexAuditor:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(AurexAuditor, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, config: Optional[AurexConfig] = None):
        if self._initialized:
            if config is not None:
                emit_warning_once(
                    "[Aurex Warning] AurexAuditor already initialized; ignoring new config. "
                    "Call AurexAuditor.reset() first to reconfigure.",
                    "_config_ignored_warning_emitted",
                    self,
                )
            return
        self.config = config or AurexConfig()
        self._ledger_warning_emitted = False
        resolved_path, resolved_storage, ledger_warning = prepare_ledger_storage(
            self.config.ledger_path,
            self.config.storage_mode,
            self.config.per_process_ledger,
        )
        self.config.ledger_path = resolved_path
        self.config.storage_mode = resolved_storage
        if ledger_warning:
            emit_warning_once(ledger_warning, "_ledger_warning_emitted", self)

        self._queue = queue.Queue(maxsize=self.config.max_queue_size)
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._memory_events = []
        self._last_minute_events = []
        self._recent_requests = []
        self._recent_responses = []
        self._ignored_workflows = set()
        self._session_retry_counts = {}
        self._session_costs = {}
        self._sync_error_count = 0
        self._last_sync_error = None
        self._events_logged = 0
        self._events_dropped = 0
        self._patch_status: Dict[str, str] = {}
        self._budget_config = self.config.budget_guard or {}
        self._tenant_policies: Dict[str, Dict[str, Any]] = {}
        self._resilience_policy = parse_resilience_config(getattr(self.config, "resilience", None))
        self._registered_fallbacks: Dict[str, Any] = {}
        self._loop_guard = LoopGuard(
            similarity_threshold=self.config.loop_similarity_threshold,
            window_seconds=60.0
        )
        self._state_store = build_state_store(self.config.redis_url)
        
        # Assign downgrade map and default pricing for reference
        self.downgrade_map = self.config.downgrade_map or {}
        self.default_pricing = self.config.default_pricing
        
        # Load custom JSON pricing if path is provided
        if self.config.pricing_path and os.path.exists(self.config.pricing_path):
            try:
                with open(self.config.pricing_path, "r", encoding="utf-8") as f:
                    custom_pricing = json.load(f)
                if isinstance(custom_pricing, dict):
                    for k, v in custom_pricing.items():
                        if isinstance(v, dict) and "input" in v and "output" in v:
                            MODEL_PRICING[k] = {"input": float(v["input"]), "output": float(v["output"])}
            except Exception as e:
                print(f"[Aurex Warning] Failed to load custom pricing from {self.config.pricing_path}: {e}", file=sys.stderr)
        
        # Create ledger folder structure if not exists (only if file storage mode)
        if self.config.storage_mode == "file":
            ledger_dir = os.path.dirname(self.config.ledger_path)
            if ledger_dir and not os.path.exists(ledger_dir):
                try:
                    os.makedirs(ledger_dir, exist_ok=True)
                except Exception as e:
                    print(f"[Aurex Warning] Could not create ledger directory: {e}", file=sys.stderr)
            pending_path = os.path.join(ledger_dir or ".", "pending.jsonl")
            if os.path.exists(pending_path):
                try:
                    recovered_events = []
                    with open(pending_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.strip():
                                try:
                                    recovered_events.append(json.loads(line))
                                except Exception:
                                    pass
                    if recovered_events:
                        with open(self.config.ledger_path, "a", encoding="utf-8") as f:
                            for event in recovered_events:
                                f.write(json.dumps(event) + "\n")
                        if self.config.cloud_sync and not self.config.local_only and self.config.api_key:
                            self._sync_to_cloud(recovered_events)
                    os.remove(pending_path)
                except Exception as e:
                    print(f"[Aurex Warning] Failed to recover pending events: {e}", file=sys.stderr)

        # Register atexit handler for graceful shutdown
        import atexit
        atexit.register(self.persist_pending_and_shutdown)

        # Register signal handlers for clean exits
        import signal
        def handle_signal(signum, frame):
            self.persist_pending_and_shutdown()
            sys.exit(0)
        try:
            signal.signal(signal.SIGINT, handle_signal)
            signal.signal(signal.SIGTERM, handle_signal)
        except ValueError:
            # signal only works in main thread, ignore if sub-thread
            pass

        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()
        
        # Task 2.3: Asynchronous Cloud-Tethered Policy Sync
        self._policy_sync_thread = None
        if self.config.cloud_sync and self.config.api_key and not self.config.local_only:
            from aurex_sdk.policy_sync import PolicySyncThread
            sync_endpoint = self.config.cloud_endpoint.replace("/ledger/events", "/policies")
            self._policy_sync_thread = PolicySyncThread(self, sync_endpoint, self.config.api_key)
            self._policy_sync_thread.start()

        self._register_fork_handler()
        self._initialized = True

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton instance (useful in tests and serverless cold starts)."""
        with cls._lock:
            if cls._instance is not None and getattr(cls._instance, "_initialized", False):
                cls._instance.shutdown()
            cls._instance = None

    def _register_fork_handler(self) -> None:
        try:
            os.register_at_fork(after_in_child=self._reinit_worker_after_fork)
        except (AttributeError, RuntimeError):
            pass

    def _reinit_worker_after_fork(self) -> None:
        self._stop_event.set()
        self._queue = queue.Queue(maxsize=self.config.max_queue_size)
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()

    def get_local_events(self) -> List[Dict[str, Any]]:
        """Return locally buffered events in memory"""
        with self._lock:
            return list(self._memory_events)

    def clear_local_events(self):
        """Clear local memory buffer"""
        with self._lock:
            self._memory_events = []

    def register_model_pricing(self, model: str, input_cost: float, output_cost: float):
        """Allow runtime pricing overrides."""
        MODEL_PRICING[model] = {"input": input_cost, "output": output_cost}

    def register_fallback(
        self,
        name: str,
        call_fn: Any,
        *,
        provider: str,
        model: str,
    ) -> None:
        """Register a named cross-provider fallback callable (customer-owned client/keys)."""
        self._registered_fallbacks[name] = {
            "call_fn": call_fn,
            "provider": provider,
            "model": model,
        }

    def _resilience_on_attempt(
        self,
        record: AttemptRecord,
        workflow_id: str,
        resp: Any,
        exc: Optional[Exception],
    ) -> None:
        extra: Dict[str, Any] = {
            "resilience_kind": record.classification.kind,
            "loss_avoided": record.loss_avoided,
        }
        if exc is not None:
            extra["error"] = str(exc)
        self.log_event(
            model=record.model,
            workflow_id=workflow_id,
            outcome=record.outcome,
            cost_type=record.cost_type,
            retry_count=record.attempt_index,
            provider=record.provider,
            attempt_index=record.attempt_index,
            recovery_provider=record.recovery_provider,
            projected_cost=record.projected_cost,
            latency_ms=record.classification.latency_ms,
            status=record.classification.status,
            error_code=record.classification.error_code,
            finish_reason=record.classification.finish_reason,
            extra_metadata=extra,
        )
        if record.outcome == "failure" and exc is not None:
            self.mark_failure(workflow_id, str(exc), metadata=extra)

    def _call_with_resilience(
        self,
        call_fn: Any,
        *,
        provider: str,
        workflow_id: str,
        model: str,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        policy = self._resilience_policy

        def on_attempt(record: AttemptRecord, resp: Any, exc: Optional[Exception]) -> None:
            self._resilience_on_attempt(record, workflow_id, resp, exc)

        if not policy.enabled:
            try:
                return call_fn()
            except Exception as ex:
                self.mark_failure(workflow_id, str(ex))
                raise

        registered = {
            k: v["call_fn"] for k, v in self._registered_fallbacks.items()
        }
        resp, _meta = execute_with_resilience(
            call_fn,
            policy,
            provider=provider,
            model=model,
            workflow_id=workflow_id,
            on_attempt=on_attempt,
            registered_fallbacks=registered,
            idempotency_key=idempotency_key,
            calculate_cost_fn=lambda m, i, o: calculate_cost(m, i, o),
        )
        return resp

    async def _acall_with_resilience(
        self,
        call_fn: Any,
        *,
        provider: str,
        workflow_id: str,
        model: str,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        policy = self._resilience_policy

        def on_attempt(record: AttemptRecord, resp: Any, exc: Optional[Exception]) -> None:
            self._resilience_on_attempt(record, workflow_id, resp, exc)

        if not policy.enabled:
            try:
                result = call_fn()
                if hasattr(result, "__await__"):
                    return await result
                return result
            except Exception as ex:
                self.mark_failure(workflow_id, str(ex))
                raise

        registered = {
            k: v["call_fn"] for k, v in self._registered_fallbacks.items()
        }
        resp, _meta = await async_execute_with_resilience(
            call_fn,
            policy,
            provider=provider,
            model=model,
            workflow_id=workflow_id,
            on_attempt=on_attempt,
            registered_fallbacks=registered,
            idempotency_key=idempotency_key,
            calculate_cost_fn=lambda m, i, o: calculate_cost(m, i, o),
        )
        return resp

    def log_event(
        self,
        model: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cached_tokens: int = 0,
        cache_write_tokens: int = 0,
        reasoning_tokens: int = 0,
        is_batch: bool = False,
        workflow_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        extra_metadata: Optional[Dict[str, Any]] = None,
        retry_count: int = 0,
        outcome: Optional[str] = None,
        cost_type: Optional[str] = None,
        tool_calls_count: int = 0,
        tool_names: Optional[List[str]] = None,
        tags: Optional[Dict[str, str]] = None,
        quality_score: Optional[float] = None,
        provider: Optional[str] = None,
        attempt_index: Optional[int] = None,
        recovery_provider: Optional[str] = None,
        projected_cost: Optional[float] = None,
        latency_ms: Optional[int] = None,
        status: Optional[str] = None,
        error_code: Optional[str] = None,
        finish_reason: Optional[str] = None,
        similarity_score: Optional[float] = None,
        has_cache_header: bool = False,
    ):
        """
        Record an LLM call to the ledger completely asynchronously.
        Zero PII Promise: Hashes prompts and system prompts locally before storing/transmitting.
        
        Args:
            cached_tokens: Tokens served from provider cache (OpenAI cached_tokens / Anthropic cache_read)
            cache_write_tokens: Tokens written to cache (Anthropic cache_creation_input_tokens)
            reasoning_tokens: Internal reasoning/thinking tokens (o1/o3 series, billed as output)
            is_batch: Whether this call used the Batch API (50% discount)
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z"
        
        # Generate locally hashes for zero-trust compliance
        prompt_hash = None
        if prompt:
            prompt_hash = hashlib.sha256(prompt.encode('utf-8')).hexdigest()
            
        system_prompt_hash = None
        if system_prompt:
            system_prompt_hash = hashlib.sha256(system_prompt.encode('utf-8')).hexdigest()
            
        response_hash = None
        if response:
            response_hash = hashlib.sha256(response.encode('utf-8')).hexdigest()
            
        # Task 2.2: Client-Side Encryption (CSE)
        enc_key = os.getenv("AUREX_ENCRYPTION_KEY")
        encrypted_prompt = None
        encrypted_system_prompt = None
        encrypted_response = None
        
        if enc_key:
            try:
                from cryptography.hazmat.primitives.ciphers.aead import AESGCM
                import base64
                key_bytes = hashlib.sha256(enc_key.encode('utf-8')).digest()
                aesgcm = AESGCM(key_bytes)
                
                def encrypt_text(text: str) -> Optional[str]:
                    if not text:
                        return None
                    iv = os.urandom(12)
                    ct = aesgcm.encrypt(iv, text.encode('utf-8'), None)
                    return base64.b64encode(iv + ct).decode('utf-8')
                    
                encrypted_prompt = encrypt_text(prompt)
                encrypted_system_prompt = encrypt_text(system_prompt)
                encrypted_response = encrypt_text(response)
            except ImportError:
                print("[Aurex SDK] AUREX_ENCRYPTION_KEY is set but 'cryptography' package is missing. Install with 'pip install cryptography'.", file=sys.stderr)
 
        resolved_provider = provider or extract_provider(model)
        # Cache-aware & >200k-cliff-aware local cost calculation
        cost = calculate_cost(
            model, input_tokens, output_tokens,
            cached_tokens=cached_tokens,
            cache_write_tokens=cache_write_tokens,
            is_batch=is_batch,
            provider=resolved_provider,
        )

        # Stage 3: Auto-classify HTTP 200 soft failures (grammar loops & thinking-exhausted empty outputs)
        if cost_type is None and model != "aurex-outcome":
            if detect_grammar_loop(response):
                cost_type = "unfulfilled_spend"
                outcome = outcome or "degraded"
                error_code = error_code or "grammar_loop"
            elif (
                not (response and response.strip())
                and tool_calls_count == 0
                and (reasoning_tokens > 0 or (finish_reason or "").lower() in ("length", "max_tokens", "max_output_tokens"))
            ):
                cost_type = "unfulfilled_spend"
                outcome = outcome or "degraded"
                error_code = error_code or "thinking_exhausted"

        tenant_id = (
            (tags or {}).get("tenant_id")
            or (extra_metadata or {}).get("tenant_id")
            or aurex_context.get().get("tenant_id")
        )

        event = {
            "timestamp": now,
            "provider": resolved_provider,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cached_tokens": cached_tokens,
            "cache_write_tokens": cache_write_tokens,
            "reasoning_tokens": reasoning_tokens,
            "is_batch": is_batch,
            "total_tokens": input_tokens + output_tokens,
            "cost": cost,
            "workflow_id": workflow_id,
            "tenant_id": tenant_id,
            "system_prompt_hash": system_prompt_hash,
            "prompt_hash": prompt_hash,
            "response_hash": response_hash,
            "encrypted_prompt": encrypted_prompt,
            "encrypted_system_prompt": encrypted_system_prompt,
            "encrypted_response": encrypted_response,
            "extra_metadata": extra_metadata or {},
            "retry_count": retry_count,
            "outcome": outcome,
            "cost_type": cost_type,
            "tool_calls_count": tool_calls_count,
            "tool_names": tool_names or [],
            "tags": tags or {},
            "quality_score": quality_score,
            "attempt_index": attempt_index,
            "recovery_provider": recovery_provider,
            "projected_cost": projected_cost,
            "latency_ms": latency_ms,
            "status": status,
            "error_code": error_code,
            "finish_reason": finish_reason,
            "similarity_score": similarity_score,
            "has_cache_header": has_cache_header,
        }

        # Optional OpenTelemetry Export
        if hasattr(self, "config") and getattr(self.config, "otel_export", False):
            try:
                from opentelemetry import trace
                tracer = trace.get_tracer("aurex-sdk")
                with tracer.start_as_current_span("llm_call") as span:
                    span.set_attribute("llm.model", model)
                    span.set_attribute("llm.provider", resolved_provider)
                    span.set_attribute("llm.input_tokens", input_tokens)
                    span.set_attribute("llm.output_tokens", output_tokens)
                    span.set_attribute("llm.cost", cost)
                    if workflow_id:
                        span.set_attribute("llm.workflow_id", workflow_id)
                    if tags:
                        for k, v in tags.items():
                            span.set_attribute(f"llm.tags.{k}", v)
                    if quality_score is not None:
                        span.set_attribute("llm.quality_score", quality_score)
            except ImportError:
                pass
        
        # Track metrics in shared StateStore (Redis or bounded memory) + local mirror
        now_ts = time.time()
        self._state_store.add_spend(workflow_id or "", cost, now_ts)
        with self._lock:
            self._last_minute_events.append({"timestamp": now_ts, "cost": cost})
            if workflow_id:
                self._session_costs[workflow_id] = self._session_costs.get(workflow_id, 0) + cost

        # Push to async worker queue - returns immediately, taking < 0.1 ms
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            self._handle_queue_overflow(event)

        # Trigger budget check & circuit breaker
        self._check_budget(cost, input_tokens, workflow_id)

    def configure_circuit_breaker(self, config: Dict[str, Any]):
        """Configure circuit breaker thresholds and limits"""
        # Normalize keys from camelCase to snake_case
        normalized = {}
        mapping = {
            "maxCostPerMinute": "max_cost_per_minute",
            "maxCostPerSession": "max_cost_per_session",
            "maxRequestsPerMinute": "max_requests_per_minute",
            "maxContextTokens": "max_context_tokens",
            "maxThinkingTokens": "max_thinking_tokens",
            "onBudgetExceeded": "on_budget_exceeded",
            "webhookUrl": "webhook_url",
            "dryRun": "dry_run"
        }
        for k, v in config.items():
            snake_k = mapping.get(k, k)
            normalized[snake_k] = v
        with self._lock:
            self._budget_config = normalized

    def configureCircuitBreaker(self, config: Dict[str, Any]):
        """Alias for configure_circuit_breaker"""
        self.configure_circuit_breaker(config)

    def configure_tenant_policies(self, policies: Dict[str, Dict[str, Any]]) -> None:
        """Apply per-tenant margin policies synced from /api/v1/policies or local config."""
        with self._lock:
            self._tenant_policies = dict(policies or {})

    def _estimate_tokens(
        self,
        prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None,
        system_prompt: Optional[str] = None,
        tools: Optional[Any] = None,
        response_format: Optional[Any] = None,
    ) -> int:
        return count_request_tokens(
            prompt=prompt,
            system_prompt=system_prompt,
            messages=messages,
            tools=tools,
            response_format=response_format,
        )

    def _debug_log(self, msg: str):
        if os.getenv("AUREX_DEBUG") == "1":
            print(f"[Aurex Debug] {msg}", file=sys.stderr)

    def _compute_semantic_loop_score(self, workflow_id: str, prompt_text: str) -> float:
        with self._lock:
            recent = [
                r for r in self._recent_responses
                if r["workflow_id"] == workflow_id and r.get("response_text")
            ][-5:]
        if len(recent) < 2 or not prompt_text:
            return 0.0
        scores = [jaccard_ngram_similarity(prompt_text, r["response_text"]) for r in recent]
        high = [s for s in scores if s >= 0.8]
        return max(scores) if len(high) >= 2 else 0.0

    def _maybe_escalate(
        self,
        workflow_id: str,
        cost_so_far: float,
        retry_count: int,
        loop_score: float,
        reason: str
    ):
        if not self.config.api_key or self.config.local_only:
            return
        
        base_endpoint = self.config.cloud_endpoint
        import re
        base = re.sub(r"/ledger/events/?$", "", base_endpoint)
        escalation_url = f"{base}/escalations"
        
        payload = {
            "workflow_id": workflow_id,
            "cost_so_far": cost_so_far,
            "retry_count": retry_count,
            "loop_score": loop_score,
            "reason": reason
        }
        
        def run_escalation():
            try:
                req_data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    escalation_url,
                    data=req_data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.config.api_key}"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    resp.read()
            except Exception as e:
                self._debug_log(f"Escalation request failed: {e}")

        threading.Thread(target=run_escalation, daemon=True).start()

    def record_response(self, workflow_id: Optional[str], response: Optional[str]):
        """Record the model response content for semantic loop detection."""
        if not response or not workflow_id:
            return
        response_hash = hashlib.sha256(response.encode("utf-8")).hexdigest()
        with self._lock:
            self._recent_responses.append({
                "workflow_id": workflow_id,
                "response_hash": response_hash,
                "response_text": response[:2000],
                "timestamp": time.time()
            })
            if len(self._recent_responses) > 100:
                self._recent_responses.pop(0)

    def ignore(self, workflow_id: Optional[str] = None):
        """Mark a workflow to skip pre-call checks."""
        wf = workflow_id or os.environ.get("AUREX_WORKFLOW_ID") or "default_workflow"
        with self._lock:
            self._ignored_workflows.add(wf)

    def wrap(self, call_fn, build_params, options: Optional[Dict[str, Any]] = None):
        """
        High-level wrapper mirroring Node SDK's wrap().
        """
        token = None
        if options:
            current_ctx = aurex_context.get().copy()
            current_ctx.update(options)
            token = aurex_context.set(current_ctx)
            
        try:
            params = build_params()
            model = params.get("model", "unknown")
            messages = params.get("messages", [])
            system_prompt = None
            user_prompt = None
            for m in messages:
                if isinstance(m, dict):
                    if m.get("role") == "system":
                        system_prompt = m.get("content")
                    elif m.get("role") == "user":
                        user_prompt = m.get("content")
                        
            # Pull workflow_id, allow options override
            ctx = aurex_context.get()
            raw_wf = params.get("user") or (params.get("metadata", {}).get("workflow_id") if isinstance(params.get("metadata"), dict) else None)
            workflow_id = resolve_workflow_id(raw_wf, ctx)
            
            decision = self.pre_call_check(
                model=model,
                prompt=user_prompt,
                system_prompt=system_prompt,
                workflow_id=workflow_id,
                messages=messages,
                tools=params.get("tools"),
                response_format=params.get("response_format"),
            )
            
            modified_params = apply_decision_to_call_params(params, decision)
            
            resp = self._call_with_resilience(
                lambda: call_fn(modified_params),
                provider=extract_provider(modified_params.get("model", model)),
                workflow_id=workflow_id,
                model=modified_params.get("model", model),
            )
                
            response_content = None
            input_tokens = 0
            output_tokens = 0
            cached_tokens = 0
            cache_write_tokens = 0
            reasoning_tokens = 0
            
            if hasattr(resp, "usage") and resp.usage:
                input_tokens = getattr(resp.usage, "prompt_tokens", 0) or 0
                output_tokens = getattr(resp.usage, "completion_tokens", 0) or 0
                if hasattr(resp.usage, "prompt_tokens_details") and resp.usage.prompt_tokens_details:
                    cached_tokens = getattr(resp.usage.prompt_tokens_details, "cached_tokens", 0) or 0
                if hasattr(resp.usage, "completion_tokens_details") and resp.usage.completion_tokens_details:
                    reasoning_tokens = getattr(resp.usage.completion_tokens_details, "reasoning_tokens", 0) or 0
            elif hasattr(resp, "usage") and hasattr(resp.usage, "input_tokens"):
                input_tokens = getattr(resp.usage, "input_tokens", 0) or 0
                output_tokens = getattr(resp.usage, "output_tokens", 0) or 0
                cached_tokens = getattr(resp.usage, "cache_read_input_tokens", 0) or 0
                cache_write_tokens = getattr(resp.usage, "cache_creation_input_tokens", 0) or 0
                
            if hasattr(resp, "choices") and resp.choices:
                choice = resp.choices[0]
                if hasattr(choice, "message") and choice.message and hasattr(choice.message, "content"):
                    response_content = choice.message.content
            elif hasattr(resp, "content") and resp.content:
                if isinstance(resp.content, list):
                    response_content = "".join(getattr(b, "text", str(b)) for b in resp.content)
                else:
                    response_content = str(resp.content)
                    
            if response_content:
                self.record_response(workflow_id, response_content)
            
            self.log_event(
                model=modified_params.get("model", model),
                prompt=user_prompt,
                response=response_content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cached_tokens=cached_tokens,
                cache_write_tokens=cache_write_tokens,
                reasoning_tokens=reasoning_tokens,
                workflow_id=workflow_id,
                system_prompt=system_prompt,
                extra_metadata=params.get("metadata")
            )
            return resp
        finally:
            if token:
                aurex_context.reset(token)

    async def awrap(self, call_fn, build_params, options: Optional[Dict[str, Any]] = None):
        """
        Asynchronous high-level wrapper.
        """
        token = None
        if options:
            current_ctx = aurex_context.get().copy()
            current_ctx.update(options)
            token = aurex_context.set(current_ctx)
            
        try:
            params = build_params()
            model = params.get("model", "unknown")
            messages = params.get("messages", [])
            system_prompt = None
            user_prompt = None
            for m in messages:
                if isinstance(m, dict):
                    if m.get("role") == "system":
                        system_prompt = m.get("content")
                    elif m.get("role") == "user":
                        user_prompt = m.get("content")
                        
            ctx = aurex_context.get()
            raw_wf = params.get("user") or (params.get("metadata", {}).get("workflow_id") if isinstance(params.get("metadata"), dict) else None)
            workflow_id = resolve_workflow_id(raw_wf, ctx)
            
            decision = self.pre_call_check(
                model=model,
                prompt=user_prompt,
                system_prompt=system_prompt,
                workflow_id=workflow_id,
                messages=messages,
                tools=params.get("tools"),
                response_format=params.get("response_format"),
            )
            
            modified_params = apply_decision_to_call_params(params, decision)
            
            resp = await self._acall_with_resilience(
                lambda: call_fn(modified_params),
                provider=extract_provider(modified_params.get("model", model)),
                workflow_id=workflow_id,
                model=modified_params.get("model", model),
            )
                
            response_content = None
            input_tokens = 0
            output_tokens = 0
            cached_tokens = 0
            cache_write_tokens = 0
            reasoning_tokens = 0
            
            if hasattr(resp, "usage") and resp.usage:
                input_tokens = getattr(resp.usage, "prompt_tokens", 0) or 0
                output_tokens = getattr(resp.usage, "completion_tokens", 0) or 0
                if hasattr(resp.usage, "prompt_tokens_details") and resp.usage.prompt_tokens_details:
                    cached_tokens = getattr(resp.usage.prompt_tokens_details, "cached_tokens", 0) or 0
                if hasattr(resp.usage, "completion_tokens_details") and resp.usage.completion_tokens_details:
                    reasoning_tokens = getattr(resp.usage.completion_tokens_details, "reasoning_tokens", 0) or 0
            elif hasattr(resp, "usage") and hasattr(resp.usage, "input_tokens"):
                input_tokens = getattr(resp.usage, "input_tokens", 0) or 0
                output_tokens = getattr(resp.usage, "output_tokens", 0) or 0
                cached_tokens = getattr(resp.usage, "cache_read_input_tokens", 0) or 0
                cache_write_tokens = getattr(resp.usage, "cache_creation_input_tokens", 0) or 0
                
            if hasattr(resp, "choices") and resp.choices:
                choice = resp.choices[0]
                if hasattr(choice, "message") and choice.message and hasattr(choice.message, "content"):
                    response_content = choice.message.content
            elif hasattr(resp, "content") and resp.content:
                if isinstance(resp.content, list):
                    response_content = "".join(getattr(b, "text", str(b)) for b in resp.content)
                else:
                    response_content = str(resp.content)
                    
            if response_content:
                self.record_response(workflow_id, response_content)
            
            self.log_event(
                model=modified_params.get("model", model),
                prompt=user_prompt,
                response=response_content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cached_tokens=cached_tokens,
                cache_write_tokens=cache_write_tokens,
                reasoning_tokens=reasoning_tokens,
                workflow_id=workflow_id,
                system_prompt=system_prompt,
                extra_metadata=params.get("metadata")
            )
            return resp
        finally:
            if token:
                aurex_context.reset(token)

    def mark_success(self, workflow_id: str, metadata: Optional[Dict[str, Any]] = None):
        self.log_event(
            model="aurex-outcome",
            input_tokens=0,
            output_tokens=0,
            workflow_id=workflow_id,
            outcome="success",
            cost_type="outcome_signal",
            extra_metadata=metadata
        )

    def mark_failure(self, workflow_id: str, reason: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None):
        extra_meta = dict(metadata) if metadata else {}
        if reason:
            extra_meta["reason"] = reason
        self.log_event(
            model="aurex-outcome",
            input_tokens=0,
            output_tokens=0,
            workflow_id=workflow_id,
            outcome="failure",
            cost_type="outcome_signal",
            extra_metadata=extra_meta
        )

    def get_health(self) -> Dict[str, Any]:
        """Return SDK integration health status, sync errors, and connection metrics."""
        ledger_dir = os.path.dirname(self.config.ledger_path) or "."
        pending_path = os.path.join(ledger_dir, "pending.jsonl")
        with self._lock:
            status = "healthy"
            if self._sync_error_count > 0 or self._events_dropped > 0:
                status = "degraded"
            return {
                "status": status,
                "sync_error_count": self._sync_error_count,
                "last_sync_error": self._last_sync_error,
                "session_costs_tracked": len(self._session_costs),
                "queue_size": self._queue.qsize(),
                "events_logged": self._events_logged,
                "events_dropped": self._events_dropped,
                "thread_active": self._thread.is_alive() if hasattr(self, "_thread") else False,
                "pending_file_exists": os.path.exists(pending_path),
                "storage_mode": self.config.storage_mode,
                "ledger_path": self.config.ledger_path,
                "patch_status": dict(self._patch_status),
            }

    def _handle_queue_overflow(self, event: Dict[str, Any]) -> None:
        """Spill to recovery file when writable; otherwise drop with counter."""
        if self.config.storage_mode == "file":
            ledger_dir = os.path.dirname(self.config.ledger_path) or "."
            recovery_path = os.path.join(ledger_dir, "queue_overflow.jsonl")
            try:
                with open(recovery_path, "a", encoding="utf-8") as handle:
                    handle.write(json.dumps(event) + "\n")
                return
            except OSError:
                pass
        with self._lock:
            self._events_dropped += 1
        emit_warning_once(
            "[Aurex Warning] Event queue full; dropping telemetry event. "
            "Increase max_queue_size or call flush() more frequently.",
            "_queue_overflow_warning_emitted",
            self,
        )

    def flush(self) -> None:
        """Force-flush queued events to the local ledger and cloud sync."""
        batch: List[Dict[str, Any]] = []
        while True:
            try:
                batch.append(self._queue.get_nowait())
            except queue.Empty:
                break
        if batch:
            self._flush_batch(batch)

    def flush_async(self, timeout: float = 30.0) -> bool:
        """Flush queued events and return True if cloud sync did not record a new error."""
        errors_before = self._sync_error_count
        self.flush()
        if not (
            self.config.cloud_sync
            and not self.config.local_only
            and self.config.api_key
        ):
            return True
        return self._sync_error_count == errors_before

    def _extract_chunk_text(self, chunk) -> str:
        # OpenAI style
        if hasattr(chunk, "choices") and chunk.choices:
            delta = chunk.choices[0].delta
            if hasattr(delta, "content") and delta.content:
                return delta.content
        # Anthropic style
        if hasattr(chunk, "type"):
            if chunk.type == "content_block_delta" and hasattr(chunk, "delta") and hasattr(chunk.delta, "text"):
                return chunk.delta.text
        # Google Gemini style
        if hasattr(chunk, "text"):
            try:
                return chunk.text
            except:
                pass
        return ""

    def _finalize_stream_event(
        self,
        *,
        accumulated_content: List[str],
        final_usage: Any,
        kwargs: Dict[str, Any],
        workflow_id: Optional[str],
        user_prompt: Optional[str],
        system_prompt: Optional[str],
        completed: bool,
        provider: Optional[str] = None,
    ) -> None:
        full_content = "".join(accumulated_content)
        if full_content:
            self.record_response(workflow_id, full_content)

        input_tokens = 0
        output_tokens = 0
        cached_tokens = 0
        reasoning_tokens = 0

        if final_usage:
            input_tokens = getattr(final_usage, "prompt_tokens", 0) or getattr(final_usage, "input_tokens", 0) or 0
            output_tokens = getattr(final_usage, "completion_tokens", 0) or getattr(final_usage, "output_tokens", 0) or 0
            if hasattr(final_usage, "prompt_tokens_details") and final_usage.prompt_tokens_details:
                cached_tokens = getattr(final_usage.prompt_tokens_details, "cached_tokens", 0) or 0
            elif hasattr(final_usage, "cache_read_input_tokens"):
                cached_tokens = getattr(final_usage, "cache_read_input_tokens", 0) or 0
            if hasattr(final_usage, "completion_tokens_details") and final_usage.completion_tokens_details:
                reasoning_tokens = getattr(final_usage.completion_tokens_details, "reasoning_tokens", 0) or 0
        else:
            input_tokens = self._estimate_tokens(
                user_prompt, kwargs.get("messages"), system_prompt, kwargs.get("tools")
            )
            output_tokens = self._estimate_tokens(full_content) if full_content else 0

        self.log_event(
            model=kwargs.get("model", "unknown"),
            prompt=user_prompt,
            response=full_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            reasoning_tokens=reasoning_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata"),
            provider=provider,
            status="ok" if completed else "aborted_stream",
            outcome="success" if completed else "degraded",
        )

    def _wrap_sync_stream(self, stream, kwargs, workflow_id, user_prompt, system_prompt, provider: Optional[str] = None):
        accumulated_content: List[str] = []
        final_usage = None
        completed = False
        try:
            for chunk in stream:
                text = self._extract_chunk_text(chunk)
                if text:
                    accumulated_content.append(text)
                if hasattr(chunk, "usage") and chunk.usage:
                    final_usage = chunk.usage
                yield chunk
            completed = True
        finally:
            self._finalize_stream_event(
                accumulated_content=accumulated_content,
                final_usage=final_usage,
                kwargs=kwargs,
                workflow_id=workflow_id,
                user_prompt=user_prompt,
                system_prompt=system_prompt,
                completed=completed,
                provider=provider,
            )

    async def _wrap_async_stream(self, stream, kwargs, workflow_id, user_prompt, system_prompt, provider: Optional[str] = None):
        accumulated_content: List[str] = []
        final_usage = None
        completed = False
        try:
            async for chunk in stream:
                text = self._extract_chunk_text(chunk)
                if text:
                    accumulated_content.append(text)
                if hasattr(chunk, "usage") and chunk.usage:
                    final_usage = chunk.usage
                yield chunk
            completed = True
        finally:
            self._finalize_stream_event(
                accumulated_content=accumulated_content,
                final_usage=final_usage,
                kwargs=kwargs,
                workflow_id=workflow_id,
                user_prompt=user_prompt,
                system_prompt=system_prompt,
                completed=completed,
                provider=provider,
            )

    def pre_call_check(
        self,
        model: str,
        prompt: Optional[str] = None,
        system_prompt: Optional[str] = None,
        workflow_id: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None,
        retry_count: Optional[int] = None,
        tools: Optional[Any] = None,
        response_format: Optional[Any] = None,
        tenant_id: Optional[str] = None,
    ) -> AurexDecision:
        """
        Stage 1 + Stage 2 real-time pre-call checks:
        - Prefix Cache-Shield (silent prefix mutations & >5m TTL rewrite traps)
        - >200k 2x Context Cliff Guard & accurate token/cost prediction
        - Budget & Loop Circuit Breaker
        """
        now = time.time()
        ctx = aurex_context.get()
        workflow_id = resolve_workflow_id(workflow_id, ctx)

        est_tokens = self._estimate_tokens(
            prompt=prompt,
            messages=messages,
            system_prompt=system_prompt,
            tools=tools,
            response_format=response_format,
        )
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest() if prompt else None
        sys_prompt_hash = hashlib.sha256(system_prompt.encode("utf-8")).hexdigest() if system_prompt else None

        req_meta = {
            "timestamp": now,
            "model": model,
            "workflow_id": workflow_id,
            "system_prompt_hash": sys_prompt_hash,
            "prompt_hash": prompt_hash,
            "prompt_text": prompt,
            "estimated_tokens": est_tokens,
        }

        with self._lock:
            self._recent_requests = [r for r in self._recent_requests if now - r["timestamp"] < 300]

            # Semantic cache suggestion check
            cache_hit_found = False
            if prompt:
                workflow_requests = [r for r in self._recent_requests if r["workflow_id"] == workflow_id]
                for r in reversed(workflow_requests):
                    prev_prompt = r.get("prompt_text")
                    if prev_prompt and jaccard_ngram_similarity(prompt, prev_prompt) > 0.9:
                        cache_hit_found = True
                        break

            self._recent_requests.append(req_meta)
            if len(self._recent_requests) > 200:
                self._recent_requests.pop(0)
            workflow_requests = [r for r in self._recent_requests if r["workflow_id"] == workflow_id]

        decision = AurexDecision(action="proceed", reason="ok", original_model=model)

        # Trigger cache hooks
        if cache_hit_found and getattr(self.config, "on_cache_hit", None):
            try:
                cached_res = self.config.on_cache_hit(workflow_id, prompt)
                if cached_res:
                    return AurexDecision(
                        action="cache_suggest",
                        reason=f"Semantic cache hit (similarity > 0.9) in workflow '{workflow_id}'",
                        response=cached_res,
                        original_model=model,
                    )
            except Exception as e:
                print(f"[Aurex SDK Cache Callback Error] {e}", file=sys.stderr)
        elif not cache_hit_found and getattr(self.config, "on_cache_miss", None):
            try:
                self.config.on_cache_miss(workflow_id, prompt)
            except Exception as e:
                print(f"[Aurex SDK Cache Callback Error] {e}", file=sys.stderr)

        with self._lock:
            if workflow_id in self._ignored_workflows:
                return decision

        # Stage 1: Run Pre-Call Prefix Cache-Shield & 200k Cliff Inspection
        shield = inspect_pre_call_shield(
            state_store=self._state_store,
            workflow_id=workflow_id,
            model=model,
            estimated_tokens=est_tokens,
            now=now,
            system_prompt=system_prompt,
            messages=messages,
            tools=tools,
            default_pricing=self.config.default_pricing,
        )
        shield_meta = shield.to_metadata()
        for w_msg in shield.warnings:
            print(f"[Aurex Shield] {w_msg}", file=sys.stderr)

        # Predicted cost uses Stage 1 cliff-aware pricing (includes 2x >200k surcharge!)
        predicted_cost = calculate_cost(model=model, input_tokens=est_tokens, output_tokens=0)

        # Load local context overrides
        ctx_budget = ctx.get("budget_guard") or {}
        budget_config = {**self._budget_config, **ctx_budget}

        simple_prompt_token_limit = ctx.get("simple_prompt_token_limit")
        if simple_prompt_token_limit is None:
            simple_prompt_token_limit = self.config.simple_prompt_token_limit

        runaway_context_multiplier = ctx.get("runaway_context_multiplier")
        if runaway_context_multiplier is None:
            runaway_context_multiplier = self.config.runaway_context_multiplier

        loop_similarity_threshold = ctx.get("loop_similarity_threshold")
        if loop_similarity_threshold is None:
            loop_similarity_threshold = self.config.loop_similarity_threshold

        budget_exceeded = False
        reason = ""
        spend = self._state_store.get_spend_summary(workflow_id, now)
        current_session_cost = spend["session_cost"]
        minute_cost = spend["minute_cost"]
        minute_requests = int(spend["minute_requests"])

        max_cost_ps = budget_config.get("max_cost_per_session")
        if workflow_id and max_cost_ps is not None:
            if current_session_cost + predicted_cost > max_cost_ps:
                budget_exceeded = True
                reason += f"Predicted cost ${predicted_cost:.4f} plus session cost ${current_session_cost:.4f} exceeds session limit of ${max_cost_ps:.4f}. "

        max_cost_pm = budget_config.get("max_cost_per_minute")
        if max_cost_pm is not None:
            if minute_cost + predicted_cost > max_cost_pm:
                budget_exceeded = True
                reason += f"Predicted cost ${predicted_cost:.4f} plus minute cost ${minute_cost:.4f} exceeds minute limit of ${max_cost_pm:.4f}. "

        max_reqs_pm = budget_config.get("max_requests_per_minute")
        if max_reqs_pm is not None:
            if minute_requests + 1 > max_reqs_pm:
                budget_exceeded = True
                reason += f"Adding this request would exceed minute requests limit of {max_reqs_pm}. "

        max_ctx_toks = budget_config.get("max_context_tokens")
        if max_ctx_toks is not None and est_tokens > max_ctx_toks:
            budget_exceeded = True
            reason += f"Estimated input tokens {est_tokens} exceeds maximum context token limit of {max_ctx_toks}. "

        if budget_exceeded:
            decision = AurexDecision(
                action="block",
                reason=reason.strip(),
                original_model=model,
            )

        if decision.action != "block":
            resolved_tenant = tenant_id or ctx.get("tenant_id")
            if resolved_tenant:
                with self._lock:
                    t_policy = self._tenant_policies.get(resolved_tenant)
                if isinstance(t_policy, dict):
                    t_action = str(t_policy.get("action") or "").lower()
                    if t_action == "block":
                        decision = AurexDecision(
                            action="block",
                            reason=f"Tenant margin guardrail blocked tenant '{resolved_tenant}'",
                            original_model=model,
                        )
                    elif t_action == "downgrade":
                        cheaper_t = t_policy.get("target_model") or suggest_cheaper_model(model)
                        if cheaper_t and cheaper_t != model:
                            decision = AurexDecision(
                                action="downgrade",
                                reason=f"Tenant margin guardrail downgraded tenant '{resolved_tenant}'",
                                suggested_model=cheaper_t,
                                original_model=model,
                            )

        if decision.action != "block":
            retry_count_val = retry_count if retry_count is not None else self._session_retry_counts.get(workflow_id, 0)

            # Stage 2: Loop Guard raises/blocks cleanly (never returns MagicMock fake chat strings)
            if self.config.enable_loop_guard and messages:
                is_loop = self._loop_guard.check_for_loop(workflow_id, messages)
                if is_loop:
                    decision = AurexDecision(
                        action="block",
                        reason=f"Loop Guard detected a structural/semantic loop in '{workflow_id}'",
                        original_model=model,
                    )

            loop_score = self._compute_semantic_loop_score(workflow_id, prompt or "")

            # Only compress if a single messages array has duplicate consecutive system blocks
            if self.config.enable_compression and messages:
                deduped = compress_messages(messages)
                if isinstance(deduped, list) and len(deduped) < len(messages):
                    decision = AurexDecision(
                        action="compress",
                        reason=f"Duplicate system messages inside request in '{workflow_id}'",
                        compressed_messages=deduped,
                        original_model=model,
                    )

            if len(workflow_requests) >= 3 and decision.action == "proceed":
                recent_workflow_reqs = workflow_requests[-3:]
                sizes = [r["estimated_tokens"] for r in recent_workflow_reqs]
                if sizes[1] >= sizes[0] * runaway_context_multiplier and sizes[2] >= sizes[1] * runaway_context_multiplier and sizes[0] > 20:
                    cheaper = suggest_cheaper_model(model)
                    decision = AurexDecision(
                        action="downgrade",
                        reason=f"Runaway context growth in '{workflow_id}'",
                        suggested_model=cheaper,
                        inject_system_instruction="Summarize prior context briefly, then continue with a shorter answer.",
                        original_model=model,
                        loop_score=loop_score,
                    )
                    with self._lock:
                        self._session_retry_counts[workflow_id] = self._session_retry_counts.get(workflow_id, 0) + 1

            # Smart downgrade complexity heuristic
            is_simple = est_tokens < simple_prompt_token_limit
            if prompt and ("```" in prompt or "~~~" in prompt):
                is_simple = False

            should_downgrade = False
            session_cost = current_session_cost
            near_budget = (
                budget_config.get("max_cost_per_session") is not None
                and session_cost > (budget_config["max_cost_per_session"] * 0.8)
            )
            if decision.action == "proceed":
                if near_budget:
                    should_downgrade = True
                elif getattr(self.config, "auto_downgrade_simple_prompts", False) and is_expensive_model(model) and is_simple:
                    should_downgrade = True

            if should_downgrade and decision.action == "proceed":
                recommended = suggest_cheaper_model(model)
                if recommended:
                    decision = AurexDecision(
                        action="downgrade",
                        reason=f"Budget threshold near for '{workflow_id}'" if near_budget else f"Over-provisioned model for simple task (~{est_tokens} tokens)",
                        suggested_model=recommended,
                        original_model=model,
                    )

            if len(workflow_requests) >= 2 and messages and decision.action == "proceed":
                initial_size = workflow_requests[0]["estimated_tokens"]
                current_size = est_tokens
                if initial_size > 0 and current_size >= initial_size * 3.5:
                    decision = AurexDecision(
                        action="compress",
                        reason=f"Context explosion in '{workflow_id}' ({initial_size} -> {current_size} est. tokens)",
                        compressed_messages=compress_messages(messages),
                        original_model=model,
                    )

            # In-Process Hybrid Loop Guard (Structural + Semantic)
            if messages:
                tool_sequence = []
                for m in messages:
                    if m.get("role") == "assistant" and m.get("tool_calls"):
                        for tc in m["tool_calls"]:
                            if "function" in tc:
                                tool_sequence.append(tc["function"]["name"])

                if len(tool_sequence) >= 3:
                    last_three = tool_sequence[-3:]
                    if last_three[0] == last_three[1] == last_three[2] or (len(tool_sequence) >= 4 and tool_sequence[-4:-2] == tool_sequence[-2:]):
                        decision = AurexDecision(
                            action="block",
                            reason=f"In-Process Loop Guard triggered: Structural repetition of tool calls {last_three}",
                            original_model=model,
                        )

            if loop_score >= loop_similarity_threshold and decision.action == "proceed":
                decision = AurexDecision(
                    action="block",
                    reason=f"In-Process Loop Guard triggered: Semantic loop detected (score {loop_score:.2f})",
                    loop_score=loop_score,
                    original_model=model,
                )

            if retry_count_val >= 3 and (loop_score >= 0.7 or decision.action != "proceed"):
                self._maybe_escalate(workflow_id, current_session_cost, retry_count_val, loop_score, decision.reason)

        decision.shield_meta = shield_meta
        decision.warnings = list(shield.warnings)
        if budget_config.get("max_thinking_tokens") is not None:
            decision.max_thinking_tokens = int(budget_config["max_thinking_tokens"])

        if decision.action != "proceed":
            mode = budget_config.get("on_budget_exceeded", "warn")
            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1":
                mode = "throw"

            msg = f"[Aurex SDK] {decision.action}: {decision.reason}"
            if mode == "throw" and decision.action == "block":
                raise AurexBlocked(
                    msg,
                    workflow_id=workflow_id,
                    reason=decision.reason,
                    action=decision.action,
                )
            elif mode != "throw":
                print(msg, file=sys.stderr)

        return decision

    def _check_budget(self, new_event_cost: float, input_tokens: int, workflow_id: Optional[str] = None):
        with self._lock:
            if not self._budget_config:
                return
            budget_cfg = dict(self._budget_config)

        now = time.time()
        spend = self._state_store.get_spend_summary(workflow_id or "", now)
        minute_cost = spend["minute_cost"]
        minute_requests = int(spend["minute_requests"])
        current_session_cost = spend["session_cost"] if workflow_id else 0.0

        with self._lock:
            self._last_minute_events = [e for e in self._last_minute_events if now - e["timestamp"] < 60]
            self._budget_config = budget_cfg

            budget_exceeded = False
            reason = ""

            max_cost_pm = self._budget_config.get("max_cost_per_minute")
            if max_cost_pm is not None and minute_cost > max_cost_pm:
                budget_exceeded = True
                reason += f"Cost per minute limit exceeded: ${minute_cost:.4f} > ${max_cost_pm:.4f}. "

            max_reqs_pm = self._budget_config.get("max_requests_per_minute")
            if max_reqs_pm is not None and minute_requests > max_reqs_pm:
                budget_exceeded = True
                reason += f"Requests per minute limit exceeded: {minute_requests} > {max_reqs_pm}. "

            max_cost_ps = self._budget_config.get("max_cost_per_session")
            if workflow_id and max_cost_ps is not None and current_session_cost > max_cost_ps:
                budget_exceeded = True
                reason += f"Cost per session limit exceeded for workflow \"{workflow_id}\": ${current_session_cost:.4f} > ${max_cost_ps:.4f}. "

            max_ctx_toks = self._budget_config.get("max_context_tokens")
            if max_ctx_toks is not None and input_tokens > max_ctx_toks:
                budget_exceeded = True
                reason += f"Input context token limit exceeded: {input_tokens} > {max_ctx_toks}. "

            if budget_exceeded:
                mode = self._budget_config.get("on_budget_exceeded", "warn")
                message = f"[Aurex SDK Budget Guard] {reason}"

                if self._budget_config.get("dry_run"):
                    print(f"[Aurex SDK Budget Guard DRY RUN] Would block: {reason}", file=sys.stderr)
                    return

                if mode == "warn":
                    print(message, file=sys.stderr)
                elif mode == "webhook" and self._budget_config.get("webhook_url"):
                    payload = {
                        "event": "budget_exceeded",
                        "reason": reason,
                        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z",
                        "details": {
                            "minuteCost": minute_cost,
                            "minuteRequests": minute_requests,
                            "sessionCost": current_session_cost if workflow_id else None,
                            "inputTokens": input_tokens,
                            "workflowId": workflow_id
                        }
                    }
                    
                    def fire_webhook():
                        try:
                            req_data = json.dumps(payload).encode("utf-8")
                            req = urllib.request.Request(
                                self._budget_config["webhook_url"],
                                data=req_data,
                                headers={"Content-Type": "application/json"},
                                method="POST"
                            )
                            with urllib.request.urlopen(req, timeout=3.0) as response:
                                response.read()
                        except Exception as ex:
                            print(f"[Aurex SDK Budget Guard] Webhook failed: {ex}", file=sys.stderr)

                    threading.Thread(target=fire_webhook, daemon=True).start()

                elif mode == "throw":
                    raise AurexBudgetExceeded(
                        message,
                        workflow_id=workflow_id,
                        limit=reason.strip(),
                        current=current_session_cost if workflow_id else minute_cost,
                    )

    def _worker_loop(self):
        """Asynchronous worker that batches operations and writes to file / cloud sync"""
        last_flush = time.time()
        batch = []
        
        while not self._stop_event.is_set() or not self._queue.empty():
            try:
                # Poll queue
                try:
                    event = self._queue.get(timeout=0.1)
                    batch.append(event)
                except queue.Empty:
                    pass

                now = time.time()
                is_timeout = (now - last_flush) >= self.config.flush_interval_seconds
                is_batch_full = len(batch) >= self.config.max_batch_size
                
                if (is_timeout or is_batch_full) and batch:
                    self._flush_batch(batch)
                    batch = []
                    last_flush = now
            except Exception as e:
                print(f"[Aurex SDK Worker Error] {e}", file=sys.stderr)

        # Flush any remaining items in batch on exit
        if batch:
            try:
                self._flush_batch(batch)
            except Exception as e:
                print(f"[Aurex SDK Worker Error on exit] {e}", file=sys.stderr)

    def _flush_batch(self, batch: List[Dict[str, Any]]):
        """Append to the local JSONL ledger file or memory buffer"""
        with self._lock:
            self._events_logged += len(batch)
        if self.config.storage_mode == "file":
            with self._lock:
                try:
                    with open(self.config.ledger_path, "a", encoding="utf-8") as f:
                        for event in batch:
                            f.write(json.dumps(event) + "\n")
                except Exception as e:
                    print(f"[Aurex SDK Ledger Error] Failed to write events to ledger: {e}", file=sys.stderr)
        else:
            with self._lock:
                self._memory_events.extend(batch)
        
        # Optional Cloud Sync
        if self.config.cloud_sync and not self.config.local_only and self.config.api_key:
            self._sync_to_cloud(batch)

    def _sync_to_cloud(self, batch: List[Dict[str, Any]]):
        """Transmit hashed metadata to the cloud backend asynchronously.

        Wire format depends on the configured endpoint:
        - `/ledger/events` (Phase 1): `{events: [...]}` with cost as `cost_usd`.
        - Anything else: legacy `{project, data: [...]}` payload.
        """
        cleaned_batch = []
        for evt in batch:
            c = evt.copy()
            if not self.config.sync_prompt_hashes:
                c.pop("prompt_hash", None)
                c.pop("system_prompt_hash", None)
                c.pop("response_hash", None)
            cleaned_batch.append(c)

        endpoint = self.config.cloud_endpoint
        if endpoint.rstrip("/").endswith("/ledger/events"):
            payload = {
                "events": [
                    {**evt, "cost_usd": evt.get("cost", 0.0)}
                    for evt in cleaned_batch
                ]
            }
        else:
            payload = {
                "project": self.config.project,
                "data": cleaned_batch,
            }

        ok, err = sync_batch_with_retry(
            endpoint,
            payload,
            self.config.api_key,
            timeout_seconds=self.config.sync_timeout_seconds,
            max_retries=self.config.sync_max_retries,
        )
        if not ok:
            with self._lock:
                self._sync_error_count += 1
                self._last_sync_error = err
            self._debug_log(f"Cloud sync failed: {err}")

    def persist_pending_and_shutdown(self):
        """Persist outstanding queue events to pending.jsonl and terminate background worker thread"""
        self._stop_event.set()
        if self._thread.is_alive():
            self._thread.join(timeout=3.0)
        
        # Drain whatever is left in self._queue
        leftover = []
        while not self._queue.empty():
            try:
                leftover.append(self._queue.get_nowait())
            except queue.Empty:
                break
                
        if leftover and self.config.storage_mode == "file":
            ledger_dir = os.path.dirname(self.config.ledger_path)
            pending_path = os.path.join(ledger_dir or ".", "pending.jsonl")
            try:
                with open(pending_path, "a", encoding="utf-8") as f:
                    for event in leftover:
                        f.write(json.dumps(event) + "\n")
            except Exception as e:
                print(f"[Aurex Warning] Failed to persist pending events: {e}", file=sys.stderr)

    def shutdown(self):
        """Flush the queue and terminate background worker thread"""
        self.persist_pending_and_shutdown()
            
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()

    # =========================================================================
    # Auto-Patching Integration Helpers for common providers
    # =========================================================================
    def patch_openai(self):
        """
        Locally auto-instrument standard openai completions.
        Any LLM requests made via 'openai' will automatically be parsed, audited, and redirected if needed.
        """
        try:
            import openai
            
            # Patch sync completions
            original_create = openai.resources.chat.completions.Completions.create
            if getattr(original_create, "__aurex_patched__", False):
                self._patch_status["openai"] = "already_patched"
                return
            
            def patched_create(cls_self, *args, **kwargs):
                tags, quality_score, workflow_id = extract_aurex_extra_params(kwargs)
                workflow_id = resolve_workflow_id(workflow_id, aurex_context.get())
                decision = None
                try:
                    messages = kwargs.get("messages", [])
                    system_prompt = None
                    user_prompt = None
                    for m in messages:
                        if m.get("role") == "system":
                            system_prompt = m.get("content")
                        elif m.get("role") == "user":
                            user_prompt = m.get("content")
                    decision = self.pre_call_check(
                        model=kwargs.get("model", "unknown"),
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        workflow_id=workflow_id,
                        messages=messages,
                        tools=kwargs.get("tools"),
                        response_format=kwargs.get("response_format"),
                    )
                    if decision:
                        if decision.action == "cache_suggest" and decision.response:
                            return create_mock_response("openai", decision.response, kwargs.get("model", "unknown"))
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
 
                base_url = extract_client_base_url(cls_self, kwargs)
                resolved_prov = resolve_endpoint_provider(kwargs.get("model", "unknown"), base_url)
                kwargs = ensure_openai_stream_usage(kwargs)
                enforced = bool(self._resilience_policy.enabled and self._resilience_policy.mode == "enforce")
                call_target = disable_sdk_internal_retries(cls_self, enforced)

                resp = self._call_with_resilience(
                    lambda: original_create(call_target, *args, **kwargs),
                    provider=resolved_prov,
                    workflow_id=workflow_id,
                    model=kwargs.get("model", "unknown"),
                )

                if kwargs.get("stream") is True:
                    return self._wrap_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt, provider=resolved_prov)

                try:
                    self._log_openai_response(kwargs, resp, tags=tags, quality_score=quality_score, provider=resolved_prov, workflow_id=workflow_id)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] OpenAI patch failed: {e}", file=sys.stderr)
                return resp
            
            patched_create.__aurex_patched__ = True
            openai.resources.chat.completions.Completions.create = patched_create
 
            # Patch async completions
            original_acreate = openai.resources.chat.completions.AsyncCompletions.create
            if getattr(original_acreate, "__aurex_patched__", False):
                return
            
            async def patched_acreate(cls_self, *args, **kwargs):
                tags, quality_score, workflow_id = extract_aurex_extra_params(kwargs)
                workflow_id = resolve_workflow_id(workflow_id, aurex_context.get())
                decision = None
                try:
                    messages = kwargs.get("messages", [])
                    system_prompt = None
                    user_prompt = None
                    for m in messages:
                        if m.get("role") == "system":
                            system_prompt = m.get("content")
                        elif m.get("role") == "user":
                            user_prompt = m.get("content")
                    decision = self.pre_call_check(
                        model=kwargs.get("model", "unknown"),
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        workflow_id=workflow_id,
                        messages=messages,
                        tools=kwargs.get("tools"),
                        response_format=kwargs.get("response_format"),
                    )
                    if decision:
                        if decision.action == "cache_suggest" and decision.response:
                            return create_mock_response("openai", decision.response, kwargs.get("model", "unknown"))
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
 
                base_url = extract_client_base_url(cls_self, kwargs)
                resolved_prov = resolve_endpoint_provider(kwargs.get("model", "unknown"), base_url)
                kwargs = ensure_openai_stream_usage(kwargs)
                enforced = bool(self._resilience_policy.enabled and self._resilience_policy.mode == "enforce")
                call_target = disable_sdk_internal_retries(cls_self, enforced)

                resp = await self._acall_with_resilience(
                    lambda: original_acreate(call_target, *args, **kwargs),
                    provider=resolved_prov,
                    workflow_id=workflow_id,
                    model=kwargs.get("model", "unknown"),
                )

                if kwargs.get("stream") is True:
                    return self._wrap_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt, provider=resolved_prov)

                try:
                    self._log_openai_response(kwargs, resp, tags=tags, quality_score=quality_score, provider=resolved_prov, workflow_id=workflow_id)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] OpenAI async patch failed: {e}", file=sys.stderr)
                return resp

            patched_acreate.__aurex_patched__ = True
            openai.resources.chat.completions.AsyncCompletions.create = patched_acreate
            self._patch_openai_responses_api(openai)
            self._patch_status["openai"] = "patched"
        except ImportError:
            self._patch_status["openai"] = "not_installed"

    def _patch_openai_responses_api(self, openai_mod: Any) -> None:
        """Lightweight OpenAI client.responses.create adapter mapping into standard Aurex events."""
        responses_mod = getattr(getattr(openai_mod, "resources", None), "responses", None)
        if responses_mod is None:
            return

        orig_create = getattr(getattr(responses_mod, "Responses", None), "create", None)
        if orig_create and not getattr(orig_create, "__aurex_patched__", False):
            def patched_resp_create(cls_self, *args, **kwargs):
                tags, quality_score, workflow_id = extract_aurex_extra_params(kwargs)
                workflow_id = resolve_workflow_id(workflow_id, aurex_context.get())
                user_prompt, system_prompt, messages = normalize_responses_api_input(kwargs)
                decision = self.pre_call_check(
                    model=kwargs.get("model", "unknown"),
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    workflow_id=workflow_id,
                    messages=messages,
                    tools=kwargs.get("tools"),
                )
                if decision:
                    kwargs = apply_decision_to_call_params(kwargs, decision)
                base_url = extract_client_base_url(cls_self, kwargs)
                resolved_prov = resolve_endpoint_provider(kwargs.get("model", "unknown"), base_url)
                enforced = bool(self._resilience_policy.enabled and self._resilience_policy.mode == "enforce")
                target = disable_sdk_internal_retries(cls_self, enforced)
                resp = self._call_with_resilience(
                    lambda: orig_create(target, *args, **kwargs),
                    provider=resolved_prov,
                    workflow_id=workflow_id,
                    model=kwargs.get("model", "unknown"),
                )
                parsed = extract_responses_api_usage(resp)
                if parsed["response_text"]:
                    self.record_response(workflow_id, parsed["response_text"])
                self.log_event(
                    model=kwargs.get("model", "unknown"),
                    prompt=user_prompt,
                    response=parsed["response_text"],
                    input_tokens=parsed["input_tokens"],
                    output_tokens=parsed["output_tokens"],
                    cached_tokens=parsed["cached_tokens"],
                    reasoning_tokens=parsed["reasoning_tokens"],
                    workflow_id=workflow_id,
                    system_prompt=system_prompt,
                    extra_metadata=kwargs.get("metadata"),
                    tags=tags,
                    quality_score=quality_score,
                    provider=resolved_prov,
                )
                return resp

            patched_resp_create.__aurex_patched__ = True
            responses_mod.Responses.create = patched_resp_create

    def _log_openai_response(
        self,
        kwargs: Dict[str, Any],
        resp: Any,
        tags: Optional[Dict[str, Any]] = None,
        quality_score: Optional[float] = None,
        provider: Optional[str] = None,
        workflow_id: Optional[str] = None,
    ):
        """Parses OpenAI call metadata, extracts system/user prompt details, hashes them locally, and logs them"""
        model = kwargs.get("model", "unknown")
        
        input_tokens = 0
        output_tokens = 0
        cached_tokens = 0
        reasoning_tokens = 0
        if hasattr(resp, "usage") and resp.usage:
            input_tokens = resp.usage.prompt_tokens or 0
            output_tokens = resp.usage.completion_tokens or 0
            
            if hasattr(resp.usage, "prompt_tokens_details") and resp.usage.prompt_tokens_details:
                cached_tokens = getattr(resp.usage.prompt_tokens_details, "cached_tokens", 0) or 0
            
            if hasattr(resp.usage, "completion_tokens_details") and resp.usage.completion_tokens_details:
                reasoning_tokens = getattr(resp.usage.completion_tokens_details, "reasoning_tokens", 0) or 0
            
        messages = kwargs.get("messages", [])
        system_prompt = None
        user_prompt = None
        for m in messages:
            role = m.get("role")
            content = m.get("content")
            if role == "system" and isinstance(content, str):
                system_prompt = content
            elif role == "user" and isinstance(content, str):
                user_prompt = content
 
        response_content = None
        tool_calls_count = 0
        tool_names = []
        if hasattr(resp, "choices") and resp.choices:
            choice = resp.choices[0]
            if hasattr(choice, "message") and choice.message:
                if hasattr(choice.message, "content"):
                    response_content = choice.message.content
                if hasattr(choice.message, "tool_calls") and choice.message.tool_calls:
                    tool_calls_count = len(choice.message.tool_calls)
                    tool_names = [getattr(tc.function, "name", "unknown") for tc in choice.message.tool_calls if hasattr(tc, "function")]
        elif isinstance(resp, dict) and "choices" in resp:
            choices = resp["choices"]
            if choices and isinstance(choices, list):
                msg = choices[0].get("message", {})
                response_content = msg.get("content")
                tool_calls = msg.get("tool_calls", [])
                tool_calls_count = len(tool_calls)
                tool_names = [tc.get("function", {}).get("name", "unknown") for tc in tool_calls if isinstance(tc, dict)]
 
        workflow_id = workflow_id or kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None) or resolve_workflow_id(None, aurex_context.get())
        
        if response_content:
            self.record_response(workflow_id, response_content)
        
        self.log_event(
            model=model,
            prompt=user_prompt,
            response=response_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            reasoning_tokens=reasoning_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata"),
            tool_calls_count=tool_calls_count,
            tool_names=tool_names,
            tags=tags,
            quality_score=quality_score,
            provider=provider,
        )

    def patch_anthropic(self):
        """
        Locally auto-instrument standard Anthropic message creation.
        """
        try:
            import anthropic
            
            # Patch sync messages
            original_create = anthropic.resources.messages.Messages.create
            if getattr(original_create, "__aurex_patched__", False):
                self._patch_status["anthropic"] = "already_patched"
                return
            
            def patched_create(cls_self, *args, **kwargs):
                tags, quality_score, workflow_id = extract_aurex_extra_params(kwargs)
                workflow_id = resolve_workflow_id(workflow_id, aurex_context.get())
                decision = None
                try:
                    system_prompt = kwargs.get("system")
                    if isinstance(system_prompt, list):
                        system_prompt = "".join(
                            getattr(b, "text", str(b)) if not isinstance(b, str) else b
                            for b in system_prompt
                        )
                    messages = kwargs.get("messages", [])
                    user_prompt = None
                    for m in reversed(messages):
                        if m.get("role") == "user":
                            content = m.get("content")
                            if isinstance(content, str):
                                user_prompt = content
                            elif isinstance(content, list):
                                user_prompt = "".join(
                                    item.get("text", "") if isinstance(item, dict) else getattr(item, "text", str(item))
                                    for item in content
                                )
                            break
                    decision = self.pre_call_check(
                        model=kwargs.get("model", "unknown"),
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        workflow_id=workflow_id,
                        messages=messages,
                        tools=kwargs.get("tools"),
                        response_format=kwargs.get("response_format"),
                    )
                    if decision:
                        if decision.action == "cache_suggest" and decision.response:
                            return create_mock_response("anthropic", decision.response, kwargs.get("model", "unknown"))
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                enforced = bool(self._resilience_policy.enabled and self._resilience_policy.mode == "enforce")
                call_target = disable_sdk_internal_retries(cls_self, enforced)
                resp = self._call_with_resilience(
                    lambda: original_create(call_target, *args, **kwargs),
                    provider="anthropic",
                    workflow_id=workflow_id,
                    model=kwargs.get("model", "unknown"),
                )

                if kwargs.get("stream") is True:
                    return self._wrap_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt, provider="anthropic")

                try:
                    self._log_anthropic_response(kwargs, resp, tags=tags, quality_score=quality_score, workflow_id=workflow_id)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] Anthropic patch failed: {e}", file=sys.stderr)
                return resp
            
            patched_create.__aurex_patched__ = True
            anthropic.resources.messages.Messages.create = patched_create

            # Patch async messages
            original_acreate = anthropic.resources.messages.AsyncMessages.create
            if getattr(original_acreate, "__aurex_patched__", False):
                self._patch_status["anthropic"] = "patched"
                return
            
            async def patched_acreate(cls_self, *args, **kwargs):
                tags, quality_score, workflow_id = extract_aurex_extra_params(kwargs)
                workflow_id = resolve_workflow_id(workflow_id, aurex_context.get())
                decision = None
                try:
                    system_prompt = kwargs.get("system")
                    if isinstance(system_prompt, list):
                        system_prompt = "".join(
                            getattr(b, "text", str(b)) if not isinstance(b, str) else b
                            for b in system_prompt
                        )
                    messages = kwargs.get("messages", [])
                    user_prompt = None
                    for m in reversed(messages):
                        if m.get("role") == "user":
                            content = m.get("content")
                            if isinstance(content, str):
                                user_prompt = content
                            elif isinstance(content, list):
                                user_prompt = "".join(
                                    item.get("text", "") if isinstance(item, dict) else getattr(item, "text", str(item))
                                    for item in content
                                )
                            break
                    decision = self.pre_call_check(
                        model=kwargs.get("model", "unknown"),
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        workflow_id=workflow_id,
                        messages=messages,
                        tools=kwargs.get("tools"),
                        response_format=kwargs.get("response_format"),
                    )
                    if decision:
                        if decision.action == "cache_suggest" and decision.response:
                            return create_mock_response("anthropic", decision.response, kwargs.get("model", "unknown"))
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                enforced = bool(self._resilience_policy.enabled and self._resilience_policy.mode == "enforce")
                call_target = disable_sdk_internal_retries(cls_self, enforced)
                resp = await self._acall_with_resilience(
                    lambda: original_acreate(call_target, *args, **kwargs),
                    provider="anthropic",
                    workflow_id=workflow_id,
                    model=kwargs.get("model", "unknown"),
                )

                if kwargs.get("stream") is True:
                    return self._wrap_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt, provider="anthropic")

                try:
                    self._log_anthropic_response(kwargs, resp, tags=tags, quality_score=quality_score, workflow_id=workflow_id)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] Anthropic async patch failed: {e}", file=sys.stderr)
                return resp
                
            patched_acreate.__aurex_patched__ = True
            anthropic.resources.messages.AsyncMessages.create = patched_acreate
            self._patch_status["anthropic"] = "patched"
        except ImportError:
            self._patch_status["anthropic"] = "not_installed"

    def _log_anthropic_response(
        self,
        kwargs: Dict[str, Any],
        resp: Any,
        tags: Optional[Dict[str, Any]] = None,
        quality_score: Optional[float] = None,
        workflow_id: Optional[str] = None,
    ):
        """Parses Anthropic call metadata, extracts system/user prompt details, hashes them locally, and logs them"""
        model = kwargs.get("model", "unknown")
        
        input_tokens = 0
        output_tokens = 0
        cached_tokens = 0
        cache_write_tokens = 0
        if hasattr(resp, "usage") and resp.usage:
            input_tokens = getattr(resp.usage, "input_tokens", 0) or 0
            output_tokens = getattr(resp.usage, "output_tokens", 0) or 0
            cached_tokens = getattr(resp.usage, "cache_read_input_tokens", 0) or 0
            cache_write_tokens = getattr(resp.usage, "cache_creation_input_tokens", 0) or 0
            
        system_prompt = kwargs.get("system")
        if isinstance(system_prompt, list):
            system_prompt = "".join(
                getattr(b, "text", str(b)) if not isinstance(b, str) else b
                for b in system_prompt
            )
            
        messages = kwargs.get("messages", [])
        user_prompt = None
        for m in reversed(messages):
            if m.get("role") == "user":
                content = m.get("content")
                if isinstance(content, str):
                    user_prompt = content
                elif isinstance(content, list):
                    user_prompt = "".join(
                        item.get("text", "") if isinstance(item, dict) else getattr(item, "text", str(item))
                        for item in content
                    )
                break
                
        response_content = None
        tool_calls_count = 0
        tool_names = []
        if hasattr(resp, "content") and resp.content:
            if isinstance(resp.content, list):
                response_content = "".join(
                    getattr(b, "text", str(b)) if getattr(b, "type", None) == "text" else ""
                    for b in resp.content
                )
                for block in resp.content:
                    if getattr(block, "type", None) == "tool_use":
                        tool_calls_count += 1
                        tool_names.append(getattr(block, "name", "unknown"))
            elif isinstance(resp.content, str):
                response_content = resp.content

        workflow_id = workflow_id or ((kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else kwargs.get("user")) or resolve_workflow_id(None, aurex_context.get())
        
        if response_content:
            self.record_response(workflow_id, response_content)
        
        self.log_event(
            model=model,
            prompt=user_prompt,
            response=response_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            cache_write_tokens=cache_write_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None,
            tool_calls_count=tool_calls_count,
            tool_names=tool_names,
            tags=tags,
            quality_score=quality_score,
            provider="anthropic",
        )

    def patch_google(self):
        """
        Locally auto-instrument standard Google Gemini generation.
        Supports both new google-genai and legacy google-generativeai.
        """
        def update_config(args, kwargs, decision):
            config_in_args = len(args) > 2
            config = args[2] if config_in_args else kwargs.get("config")
            
            if config is not None:
                if hasattr(config, "system_instruction"):
                    orig = getattr(config, "system_instruction", None)
                    orig_str = str(orig) if orig else ""
                    setattr(config, "system_instruction", f"{decision.inject_system_instruction}\n{orig_str}".strip())
                elif isinstance(config, dict):
                    orig_str = config.get("system_instruction") or ""
                    config["system_instruction"] = f"{decision.inject_system_instruction}\n{orig_str}".strip()
            else:
                try:
                    from google.genai import types
                    config = types.GenerateContentConfig(system_instruction=decision.inject_system_instruction)
                except Exception:
                    config = {"system_instruction": decision.inject_system_instruction}
                
                if config_in_args:
                    args = args[:2] + (config,) + args[3:]
                else:
                    kwargs["config"] = config
            return args, kwargs

        # 1. New google-genai SDK
        try:
            import google.genai.models as genai_models
            
            # Patch sync generate_content
            if hasattr(genai_models.Models, "generate_content"):
                original_generate = genai_models.Models.generate_content
                if not getattr(original_generate, "__aurex_patched__", False):
                    def patched_generate(models_self, *args, **kwargs):
                        model = args[0] if len(args) > 0 else kwargs.get("model")
                        contents = args[1] if len(args) > 1 else kwargs.get("contents")
                        config = args[2] if len(args) > 2 else kwargs.get("config")
                        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                        
                        user_prompt = None
                        if isinstance(contents, str):
                            user_prompt = contents
                        elif isinstance(contents, list):
                            user_prompt = " ".join(str(c) for c in contents)
                        elif contents:
                            user_prompt = str(contents)
                            
                        system_prompt = None
                        if config is not None:
                            if hasattr(config, "system_instruction"):
                                instr = getattr(config, "system_instruction", None)
                                if instr:
                                    if hasattr(instr, "parts") and instr.parts:
                                        system_prompt = " ".join(getattr(p, "text", str(p)) for p in instr.parts)
                                    else:
                                        system_prompt = str(instr)
                            elif isinstance(config, dict):
                                system_prompt = str(config.get("system_instruction", "")) or None
                                
                        decision = None
                        try:
                            decision = self.pre_call_check(
                                model=normalize_model_name(model or "gemini-2.5-flash"),
                                prompt=user_prompt,
                                system_prompt=system_prompt,
                                workflow_id=workflow_id,
                                messages=None
                            )
                            if decision:
                                if decision.action == "downgrade" and decision.suggested_model:
                                    suggested = decision.suggested_model
                                    if len(args) > 0:
                                        args = (suggested,) + args[1:]
                                    else:
                                        kwargs["model"] = suggested
                                if decision.inject_system_instruction:
                                    args, kwargs = update_config(args, kwargs, decision)
                        except Exception as e:
                            if decision and decision.action == "block":
                                raise e
                            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                                raise e
                            print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
                            
                        resp = self._call_with_resilience(
                            lambda: original_generate(models_self, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        try:
                            self._log_google_response(model or "gemini-2.5-flash", args, kwargs, resp)
                        except Exception as e:
                            print(f"[Aurex SDK Patch Error] Google GenAI patch failed: {e}", file=sys.stderr)
                        return resp
                        
                    patched_generate.__aurex_patched__ = True
                    genai_models.Models.generate_content = patched_generate
                    
            # Patch sync generate_content_stream
            if hasattr(genai_models.Models, "generate_content_stream"):
                original_generate_stream = genai_models.Models.generate_content_stream
                if not getattr(original_generate_stream, "__aurex_patched__", False):
                    def patched_generate_stream(models_self, *args, **kwargs):
                        model = args[0] if len(args) > 0 else kwargs.get("model")
                        contents = args[1] if len(args) > 1 else kwargs.get("contents")
                        config = args[2] if len(args) > 2 else kwargs.get("config")
                        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                        
                        user_prompt = None
                        if isinstance(contents, str):
                            user_prompt = contents
                        elif isinstance(contents, list):
                            user_prompt = " ".join(str(c) for c in contents)
                        elif contents:
                            user_prompt = str(contents)
                            
                        system_prompt = None
                        if config is not None:
                            if hasattr(config, "system_instruction"):
                                instr = getattr(config, "system_instruction", None)
                                if instr:
                                    if hasattr(instr, "parts") and instr.parts:
                                        system_prompt = " ".join(getattr(p, "text", str(p)) for p in instr.parts)
                                    else:
                                        system_prompt = str(instr)
                            elif isinstance(config, dict):
                                system_prompt = str(config.get("system_instruction", "")) or None
                                
                        decision = None
                        try:
                            decision = self.pre_call_check(
                                model=normalize_model_name(model or "gemini-2.5-flash"),
                                prompt=user_prompt,
                                system_prompt=system_prompt,
                                workflow_id=workflow_id,
                                messages=None
                            )
                            if decision:
                                if decision.action == "downgrade" and decision.suggested_model:
                                    suggested = decision.suggested_model
                                    if len(args) > 0:
                                        args = (suggested,) + args[1:]
                                    else:
                                        kwargs["model"] = suggested
                                if decision.inject_system_instruction:
                                    args, kwargs = update_config(args, kwargs, decision)
                        except Exception as e:
                            if decision and decision.action == "block":
                                raise e
                            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                                raise e
                            print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
                            
                        resp = self._call_with_resilience(
                            lambda: original_generate_stream(models_self, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        return self._wrap_sync_stream(resp, {"model": model or "gemini-2.5-flash"}, workflow_id, user_prompt, system_prompt)
                        
                    patched_generate_stream.__aurex_patched__ = True
                    genai_models.Models.generate_content_stream = patched_generate_stream
                    
            # Patch async generate_content
            if hasattr(genai_models.AsyncModels, "generate_content"):
                original_generate_async = genai_models.AsyncModels.generate_content
                if not getattr(original_generate_async, "__aurex_patched__", False):
                    async def patched_generate_async(models_self, *args, **kwargs):
                        model = args[0] if len(args) > 0 else kwargs.get("model")
                        contents = args[1] if len(args) > 1 else kwargs.get("contents")
                        config = args[2] if len(args) > 2 else kwargs.get("config")
                        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                        
                        user_prompt = None
                        if isinstance(contents, str):
                            user_prompt = contents
                        elif isinstance(contents, list):
                            user_prompt = " ".join(str(c) for c in contents)
                        elif contents:
                            user_prompt = str(contents)
                            
                        system_prompt = None
                        if config is not None:
                            if hasattr(config, "system_instruction"):
                                instr = getattr(config, "system_instruction", None)
                                if instr:
                                    if hasattr(instr, "parts") and instr.parts:
                                        system_prompt = " ".join(getattr(p, "text", str(p)) for p in instr.parts)
                                    else:
                                        system_prompt = str(instr)
                            elif isinstance(config, dict):
                                system_prompt = str(config.get("system_instruction", "")) or None
                                
                        decision = None
                        try:
                            decision = self.pre_call_check(
                                model=normalize_model_name(model or "gemini-2.5-flash"),
                                prompt=user_prompt,
                                system_prompt=system_prompt,
                                workflow_id=workflow_id,
                                messages=None
                            )
                            if decision:
                                if decision.action == "downgrade" and decision.suggested_model:
                                    suggested = decision.suggested_model
                                    if len(args) > 0:
                                        args = (suggested,) + args[1:]
                                    else:
                                        kwargs["model"] = suggested
                                if decision.inject_system_instruction:
                                    args, kwargs = update_config(args, kwargs, decision)
                        except Exception as e:
                            if decision and decision.action == "block":
                                raise e
                            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                                raise e
                            print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
                            
                        resp = await self._acall_with_resilience(
                            lambda: original_generate_async(models_self, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        try:
                            self._log_google_response(model or "gemini-2.5-flash", args, kwargs, resp)
                        except Exception as e:
                            print(f"[Aurex SDK Patch Error] Google GenAI async patch failed: {e}", file=sys.stderr)
                        return resp
                        
                    patched_generate_async.__aurex_patched__ = True
                    genai_models.AsyncModels.generate_content = patched_generate_async
                    
            # Patch async generate_content_stream
            if hasattr(genai_models.AsyncModels, "generate_content_stream"):
                original_generate_stream_async = genai_models.AsyncModels.generate_content_stream
                if not getattr(original_generate_stream_async, "__aurex_patched__", False):
                    async def patched_generate_stream_async(models_self, *args, **kwargs):
                        model = args[0] if len(args) > 0 else kwargs.get("model")
                        contents = args[1] if len(args) > 1 else kwargs.get("contents")
                        config = args[2] if len(args) > 2 else kwargs.get("config")
                        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                        
                        user_prompt = None
                        if isinstance(contents, str):
                            user_prompt = contents
                        elif isinstance(contents, list):
                            user_prompt = " ".join(str(c) for c in contents)
                        elif contents:
                            user_prompt = str(contents)
                            
                        system_prompt = None
                        if config is not None:
                            if hasattr(config, "system_instruction"):
                                instr = getattr(config, "system_instruction", None)
                                if instr:
                                    if hasattr(instr, "parts") and instr.parts:
                                        system_prompt = " ".join(getattr(p, "text", str(p)) for p in instr.parts)
                                    else:
                                        system_prompt = str(instr)
                            elif isinstance(config, dict):
                                system_prompt = str(config.get("system_instruction", "")) or None
                                
                        decision = None
                        try:
                            decision = self.pre_call_check(
                                model=normalize_model_name(model or "gemini-2.5-flash"),
                                prompt=user_prompt,
                                system_prompt=system_prompt,
                                workflow_id=workflow_id,
                                messages=None
                            )
                            if decision:
                                if decision.action == "downgrade" and decision.suggested_model:
                                    suggested = decision.suggested_model
                                    if len(args) > 0:
                                        args = (suggested,) + args[1:]
                                    else:
                                        kwargs["model"] = suggested
                                if decision.inject_system_instruction:
                                    args, kwargs = update_config(args, kwargs, decision)
                        except Exception as e:
                            if decision and decision.action == "block":
                                raise e
                            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                                raise e
                            print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
                            
                        resp = await self._acall_with_resilience(
                            lambda: original_generate_stream_async(models_self, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        return self._wrap_async_stream(resp, {"model": model or "gemini-2.5-flash"}, workflow_id, user_prompt, system_prompt)
                        
                    patched_generate_stream_async.__aurex_patched__ = True
                    genai_models.AsyncModels.generate_content_stream = patched_generate_stream_async
                    
        except ImportError:
            pass

        # 2. Legacy google-generativeai SDK
        try:
            import google.generativeai as genai
            
            # Patch sync generate_content
            original_generate = genai.GenerativeModel.generate_content
            if not getattr(original_generate, "__aurex_patched__", False):
                def patched_generate_legacy(model_self, *args, **kwargs):
                    workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                    decision = None
                    try:
                        contents = kwargs.get("contents")
                        if not contents and len(args) > 0:
                            contents = args[0]
                        user_prompt = None
                        if isinstance(contents, str):
                            user_prompt = contents
                        elif isinstance(contents, list):
                            user_prompt = " ".join(str(c) for c in contents)
                        elif contents:
                            user_prompt = str(contents)
                        system_prompt = None
                        config = getattr(model_self, "_system_instruction", None) or getattr(model_self, "system_instruction", None)
                        if config:
                            if hasattr(config, "parts") and config.parts:
                                system_prompt = " ".join(getattr(p, "text", str(p)) for p in config.parts)
                            else:
                                system_prompt = str(config)
                        
                        decision = self.pre_call_check(
                            model=normalize_model_name(getattr(model_self, "model_name", "gemini-1.5-flash")),
                            prompt=user_prompt,
                            system_prompt=system_prompt,
                            workflow_id=workflow_id,
                            messages=None
                        )
                        
                        if decision:
                            if decision.action == "downgrade" and decision.suggested_model:
                                suggested = decision.suggested_model
                                if not suggested.startswith("models/"):
                                    suggested = f"models/{suggested}"
                                model_self.model_name = suggested
                                if hasattr(model_self, "_model_name"):
                                    model_self._model_name = suggested
                            if decision.inject_system_instruction:
                                model_self._system_instruction = decision.inject_system_instruction
                    except Exception as e:
                        if decision and decision.action == "block":
                            raise e
                        if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                            raise e
                        print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                    resp = self._call_with_resilience(
                        lambda: original_generate(model_self, *args, **kwargs),
                        provider=extract_provider(kwargs.get('model', 'unknown')),
                        workflow_id=workflow_id,
                        model=kwargs.get('model', 'unknown'),
                    )

                    is_stream = kwargs.get("stream") is True
                    if is_stream:
                        return self._wrap_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                    try:
                        self._log_google_response(model_self, args, kwargs, resp)
                    except Exception as e:
                        print(f"[Aurex SDK Patch Error] Google patch failed: {e}", file=sys.stderr)
                    return resp
                
                patched_generate_legacy.__aurex_patched__ = True
                genai.GenerativeModel.generate_content = patched_generate_legacy

            # Patch async generate_content
            original_generate_async = genai.GenerativeModel.generate_content_async
            if not getattr(original_generate_async, "__aurex_patched__", False):
                async def patched_generate_async_legacy(model_self, *args, **kwargs):
                    workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                    decision = None
                    try:
                        contents = kwargs.get("contents")
                        if not contents and len(args) > 0:
                            contents = args[0]
                        user_prompt = None
                        if isinstance(contents, str):
                            user_prompt = contents
                        elif isinstance(contents, list):
                            user_prompt = " ".join(str(c) for c in contents)
                        elif contents:
                            user_prompt = str(contents)
                        system_prompt = None
                        config = getattr(model_self, "_system_instruction", None) or getattr(model_self, "system_instruction", None)
                        if config:
                            if hasattr(config, "parts") and config.parts:
                                system_prompt = " ".join(getattr(p, "text", str(p)) for p in config.parts)
                            else:
                                system_prompt = str(config)
                        
                        decision = self.pre_call_check(
                            model=normalize_model_name(getattr(model_self, "model_name", "gemini-1.5-flash")),
                            prompt=user_prompt,
                            system_prompt=system_prompt,
                            workflow_id=workflow_id,
                            messages=None
                        )
                        
                        if decision:
                            if decision.action == "downgrade" and decision.suggested_model:
                                suggested = decision.suggested_model
                                if not suggested.startswith("models/"):
                                    suggested = f"models/{suggested}"
                                model_self.model_name = suggested
                                if hasattr(model_self, "_model_name"):
                                    model_self._model_name = suggested
                            if decision.inject_system_instruction:
                                model_self._system_instruction = decision.inject_system_instruction
                    except Exception as e:
                        if decision and decision.action == "block":
                            raise e
                        if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                            raise e
                        print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                    resp = await self._acall_with_resilience(
                        lambda: original_generate_async(model_self, *args, **kwargs),
                        provider=extract_provider(kwargs.get('model', 'unknown')),
                        workflow_id=workflow_id,
                        model=kwargs.get('model', 'unknown'),
                    )

                    is_stream = kwargs.get("stream") is True
                    if is_stream:
                        return self._wrap_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                    try:
                        self._log_google_response(model_self, args, kwargs, resp)
                    except Exception as e:
                        print(f"[Aurex SDK Patch Error] Google async patch failed: {e}", file=sys.stderr)
                    return resp
                    
                patched_generate_async_legacy.__aurex_patched__ = True
                genai.GenerativeModel.generate_content_async = patched_generate_async_legacy
        except ImportError:
            pass

    def _log_google_response(self, model_self: Any, args: tuple, kwargs: Dict[str, Any], resp: Any):
        """Parses Google Gemini response metadata, hashes prompts locally, and logs them"""
        if isinstance(model_self, str):
            model = normalize_model_name(model_self)
        else:
            model = normalize_model_name(getattr(model_self, "model_name", "gemini-1.5-flash"))
        
        def _as_int(v: Any) -> int:
            return v if isinstance(v, int) and not isinstance(v, bool) else 0

        input_tokens = 0
        output_tokens = 0
        thoughts_tokens = 0
        cached_tokens = 0
        if hasattr(resp, "usage_metadata") and resp.usage_metadata:
            input_tokens = _as_int(getattr(resp.usage_metadata, "prompt_token_count", 0))
            candidates_tokens = _as_int(getattr(resp.usage_metadata, "candidates_token_count", 0))
            thoughts_tokens = _as_int(getattr(resp.usage_metadata, "thoughts_token_count", 0))
            cached_tokens = _as_int(getattr(resp.usage_metadata, "cached_content_token_count", 0))
            # Gemini bills internal thinking tokens at output token rates
            output_tokens = candidates_tokens + thoughts_tokens
            
        contents = kwargs.get("contents")
        if not contents and len(args) > 0:
            contents = args[0]
            
        user_prompt = None
        if isinstance(contents, str):
            user_prompt = contents
        elif isinstance(contents, list):
            user_prompt = " ".join(str(c) for c in contents)
        elif contents:
            user_prompt = str(contents)
            
        system_prompt = None
        config = None
        if not isinstance(model_self, str):
            config = getattr(model_self, "_system_instruction", None) or getattr(model_self, "system_instruction", None)
        if not config:
            config = kwargs.get("config")
        if config:
            if hasattr(config, "parts") and config.parts:
                system_prompt = " ".join(getattr(p, "text", str(p)) for p in config.parts)
            elif hasattr(config, "system_instruction") and config.system_instruction:
                instr = config.system_instruction
                if hasattr(instr, "parts") and instr.parts:
                    system_prompt = " ".join(getattr(p, "text", str(p)) for p in instr.parts)
                else:
                    system_prompt = str(instr)
            elif isinstance(config, dict) and "system_instruction" in config:
                system_prompt = str(config["system_instruction"])
            else:
                system_prompt = str(config)
                
        response_content = None
        try:
            if hasattr(resp, "text"):
                response_content = resp.text
        except Exception:
            pass

        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None
        
        if response_content:
            self.record_response(workflow_id, response_content)
        
        self.log_event(
            model=model,
            prompt=user_prompt,
            response=response_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            reasoning_tokens=thoughts_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None,
            provider="google",
        )

    def patch_litellm(self):
        """Patch LiteLLM's `completion` (and async variant) to auto-log events."""
        try:
            import litellm  # type: ignore
        except ImportError:
            return

        original = getattr(litellm, "completion", None)
        if original is not None and not getattr(original, "__aurex_patched__", False):
            def patched_completion(*args, **kwargs):
                raw_wf = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None)
                workflow_id = resolve_workflow_id(raw_wf, aurex_context.get())
                decision = None
                try:
                    messages = kwargs.get("messages", [])
                    system_prompt = None
                    user_prompt = None
                    for m in messages:
                        if m.get("role") == "system":
                            system_prompt = m.get("content")
                        elif m.get("role") == "user":
                            user_prompt = m.get("content")
                    decision = self.pre_call_check(
                        model=kwargs.get("model", "unknown"),
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        workflow_id=workflow_id,
                        messages=messages,
                        tools=kwargs.get("tools"),
                        response_format=kwargs.get("response_format"),
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                resp = self._call_with_resilience(
                    lambda: original(*args, **kwargs),
                    provider=extract_provider(kwargs.get('model', 'unknown')),
                    workflow_id=workflow_id,
                    model=kwargs.get('model', 'unknown'),
                )

                if kwargs.get("stream") is True:
                    return self._wrap_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_litellm_response(kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] LiteLLM patch failed: {e}", file=sys.stderr)
                return resp
            patched_completion.__aurex_patched__ = True  # type: ignore[attr-defined]
            litellm.completion = patched_completion

        original_a = getattr(litellm, "acompletion", None)
        if original_a is not None and not getattr(original_a, "__aurex_patched__", False):
            async def patched_acompletion(*args, **kwargs):
                raw_wf = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None)
                workflow_id = resolve_workflow_id(raw_wf, aurex_context.get())
                decision = None
                try:
                    messages = kwargs.get("messages", [])
                    system_prompt = None
                    user_prompt = None
                    for m in messages:
                        if m.get("role") == "system":
                            system_prompt = m.get("content")
                        elif m.get("role") == "user":
                            user_prompt = m.get("content")
                    decision = self.pre_call_check(
                        model=kwargs.get("model", "unknown"),
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        workflow_id=workflow_id,
                        messages=messages,
                        tools=kwargs.get("tools"),
                        response_format=kwargs.get("response_format"),
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                resp = await self._acall_with_resilience(
                    lambda: original_a(*args, **kwargs),
                    provider=extract_provider(kwargs.get('model', 'unknown')),
                    workflow_id=workflow_id,
                    model=kwargs.get('model', 'unknown'),
                )

                if kwargs.get("stream") is True:
                    return self._wrap_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_litellm_response(kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] LiteLLM async patch failed: {e}", file=sys.stderr)
                return resp
            patched_acompletion.__aurex_patched__ = True  # type: ignore[attr-defined]
            litellm.acompletion = patched_acompletion

    def _log_litellm_response(self, kwargs: Dict[str, Any], resp: Any):
        """Extract usage from a LiteLLM completion result and log a single event."""
        model = kwargs.get("model", "unknown")

        input_tokens = 0
        output_tokens = 0
        cached_tokens = 0
        cache_write_tokens = 0
        usage = getattr(resp, "usage", None)
        if usage is None and isinstance(resp, dict):
            usage = resp.get("usage")
        if usage is not None:
            def _read(u, key):
                if isinstance(u, dict):
                    return u.get(key, 0) or 0
                return getattr(u, key, 0) or 0
            input_tokens = int(_read(usage, "prompt_tokens") or _read(usage, "input_tokens") or 0)
            output_tokens = int(_read(usage, "completion_tokens") or _read(usage, "output_tokens") or 0)
            cached_tokens = int(
                _read(usage, "cache_read_input_tokens")
                or _read(usage, "cached_tokens")
                or 0
            )
            cache_write_tokens = int(_read(usage, "cache_creation_input_tokens") or 0)

        messages = kwargs.get("messages") or []
        user_prompt = None
        system_prompt = None
        for m in messages:
            role = m.get("role") if isinstance(m, dict) else getattr(m, "role", None)
            content = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
            if role == "system" and isinstance(content, str):
                system_prompt = content
            if role == "user" and isinstance(content, str):
                user_prompt = content

        response_content = None
        if hasattr(resp, "choices") and resp.choices:
            choice = resp.choices[0]
            if hasattr(choice, "message") and choice.message and hasattr(choice.message, "content"):
                response_content = choice.message.content
        elif isinstance(resp, dict) and "choices" in resp:
            choices = resp["choices"]
            if choices and isinstance(choices, list):
                msg = choices[0].get("message", {})
                response_content = msg.get("content")

        raw_wf = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None)
        workflow_id = resolve_workflow_id(raw_wf, aurex_context.get())

        if response_content:
            self.record_response(workflow_id, response_content)

        self.log_event(
            model=model,
            prompt=user_prompt,
            response=response_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            cache_write_tokens=cache_write_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None,
        )

    def _wrap_ollama_sync_stream(self, stream, kwargs, workflow_id, user_prompt, system_prompt, model, is_chat):
        accumulated_content = []
        final_input_tokens = 0
        final_output_tokens = 0
        
        for chunk in stream:
            text = None
            if isinstance(chunk, dict):
                if is_chat:
                    text = chunk.get("message", {}).get("content")
                else:
                    text = chunk.get("response")
                if "prompt_eval_count" in chunk:
                    final_input_tokens = chunk["prompt_eval_count"]
                if "eval_count" in chunk:
                    final_output_tokens = chunk["eval_count"]
            else:
                if is_chat:
                    msg = getattr(chunk, "message", None)
                    text = getattr(msg, "content", None) if msg else None
                else:
                    text = getattr(chunk, "response", None)
                if hasattr(chunk, "prompt_eval_count"):
                    final_input_tokens = chunk.prompt_eval_count
                if hasattr(chunk, "eval_count"):
                    final_output_tokens = chunk.eval_count
                    
            if text:
                accumulated_content.append(text)
            yield chunk
            
        full_content = "".join(accumulated_content)
        self.record_response(workflow_id, full_content)
        
        if not final_input_tokens:
            final_input_tokens = self._estimate_tokens(user_prompt, kwargs.get("messages"))
        if not final_output_tokens:
            final_output_tokens = max(1, len(full_content) // 4)
            
        self.log_event(
            model=model,
            prompt=user_prompt,
            response=full_content,
            input_tokens=final_input_tokens,
            output_tokens=final_output_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None,
            provider="ollama"
        )

    async def _wrap_ollama_async_stream(self, stream, kwargs, workflow_id, user_prompt, system_prompt, model, is_chat):
        accumulated_content = []
        final_input_tokens = 0
        final_output_tokens = 0
        
        async for chunk in stream:
            text = None
            if isinstance(chunk, dict):
                if is_chat:
                    text = chunk.get("message", {}).get("content")
                else:
                    text = chunk.get("response")
                if "prompt_eval_count" in chunk:
                    final_input_tokens = chunk["prompt_eval_count"]
                if "eval_count" in chunk:
                    final_output_tokens = chunk["eval_count"]
            else:
                if is_chat:
                    msg = getattr(chunk, "message", None)
                    text = getattr(msg, "content", None) if msg else None
                else:
                    text = getattr(chunk, "response", None)
                if hasattr(chunk, "prompt_eval_count"):
                    final_input_tokens = chunk.prompt_eval_count
                if hasattr(chunk, "eval_count"):
                    final_output_tokens = chunk.eval_count
                    
            if text:
                accumulated_content.append(text)
            yield chunk
            
        full_content = "".join(accumulated_content)
        self.record_response(workflow_id, full_content)
        
        if not final_input_tokens:
            final_input_tokens = self._estimate_tokens(user_prompt, kwargs.get("messages"))
        if not final_output_tokens:
            final_output_tokens = max(1, len(full_content) // 4)
            
        self.log_event(
            model=model,
            prompt=user_prompt,
            response=full_content,
            input_tokens=final_input_tokens,
            output_tokens=final_output_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None,
            provider="ollama"
        )

    def _log_ollama_response(self, model: str, kwargs: Dict[str, Any], resp: Any, user_prompt: str, system_prompt: str):
        input_tokens = 0
        output_tokens = 0
        if isinstance(resp, dict):
            input_tokens = resp.get("prompt_eval_count", 0) or 0
            output_tokens = resp.get("eval_count", 0) or 0
        else:
            input_tokens = getattr(resp, "prompt_eval_count", 0) or 0
            output_tokens = getattr(resp, "eval_count", 0) or 0
        
        response_content = None
        if isinstance(resp, dict):
            if "message" in resp and isinstance(resp["message"], dict):
                response_content = resp["message"].get("content")
            else:
                response_content = resp.get("response")
        else:
            if hasattr(resp, "message") and hasattr(resp.message, "content"):
                response_content = resp.message.content
            else:
                response_content = getattr(resp, "response", None)

        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
        if response_content:
            self.record_response(workflow_id, response_content)

        self.log_event(
            model=model,
            prompt=user_prompt,
            response=response_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None,
            provider="ollama"
        )

    def patch_ollama(self):
        """
        Locally auto-instrument standard Ollama generation.
        """
        try:
            import ollama
            
            # Helper to wrap sync/async patch
            def make_patched_method(original_method, is_chat, is_async):
                if is_async:
                    async def patched_method(*args, **kwargs):
                        model = kwargs.get("model") or (args[0] if len(args) > 0 else "unknown")
                        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                        
                        user_prompt = ""
                        system_prompt = ""
                        if is_chat:
                            messages = kwargs.get("messages") or (args[1] if len(args) > 1 else [])
                            for m in messages:
                                role = m.get("role") if isinstance(m, dict) else getattr(m, "role", None)
                                content = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
                                if role == "system":
                                    system_prompt = content
                                elif role == "user":
                                    user_prompt = content
                        else:
                            user_prompt = kwargs.get("prompt") or (args[1] if len(args) > 1 else "")
                            
                        # pre-call check
                        decision = None
                        try:
                            decision = self.pre_call_check(
                                model=normalize_model_name(model),
                                prompt=user_prompt,
                                system_prompt=system_prompt,
                                workflow_id=workflow_id,
                                messages=kwargs.get("messages") if is_chat else None
                            )
                            if decision:
                                if decision.action == "downgrade" and decision.suggested_model:
                                    if "model" in kwargs:
                                        kwargs["model"] = decision.suggested_model
                                    elif len(args) > 0:
                                        args = (decision.suggested_model,) + args[1:]
                                # system instruction injection
                                if decision.inject_system_instruction:
                                    if is_chat:
                                        # Inject system message
                                        messages = list(kwargs.get("messages") or args[1])
                                        messages.insert(0, {"role": "system", "content": decision.inject_system_instruction})
                                        if "messages" in kwargs:
                                            kwargs["messages"] = messages
                                        else:
                                            args = (args[0], messages) + args[2:]
                                    else:
                                        user_prompt = f"{decision.inject_system_instruction}\n{user_prompt}"
                                        if "prompt" in kwargs:
                                            kwargs["prompt"] = user_prompt
                                        else:
                                            args = (args[0], user_prompt) + args[2:]
                        except Exception as e:
                            if decision and decision.action == "block":
                                raise e
                            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                                raise e
                            print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
                            
                        resp = await self._acall_with_resilience(
                            lambda: original_method(*args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        if kwargs.get("stream") is True:
                            return self._wrap_ollama_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt, model, is_chat)
                            
                        try:
                            self._log_ollama_response(model, kwargs, resp, user_prompt, system_prompt)
                        except Exception as e:
                            print(f"[Aurex SDK Patch Error] Ollama async patch failed: {e}", file=sys.stderr)
                        return resp
                    return patched_method
                else:
                    def patched_method(*args, **kwargs):
                        model = kwargs.get("model") or (args[0] if len(args) > 0 else "unknown")
                        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else "default_workflow"
                        
                        user_prompt = ""
                        system_prompt = ""
                        if is_chat:
                            messages = kwargs.get("messages") or (args[1] if len(args) > 1 else [])
                            for m in messages:
                                role = m.get("role") if isinstance(m, dict) else getattr(m, "role", None)
                                content = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
                                if role == "system":
                                    system_prompt = content
                                elif role == "user":
                                    user_prompt = content
                        else:
                            user_prompt = kwargs.get("prompt") or (args[1] if len(args) > 1 else "")
                            
                        # pre-call check
                        decision = None
                        try:
                            decision = self.pre_call_check(
                                model=normalize_model_name(model),
                                prompt=user_prompt,
                                system_prompt=system_prompt,
                                workflow_id=workflow_id,
                                messages=kwargs.get("messages") if is_chat else None
                            )
                            if decision:
                                if decision.action == "downgrade" and decision.suggested_model:
                                    if "model" in kwargs:
                                        kwargs["model"] = decision.suggested_model
                                    elif len(args) > 0:
                                        args = (decision.suggested_model,) + args[1:]
                                # system instruction injection
                                if decision.inject_system_instruction:
                                    if is_chat:
                                        # Inject system message
                                        messages = list(kwargs.get("messages") or args[1])
                                        messages.insert(0, {"role": "system", "content": decision.inject_system_instruction})
                                        if "messages" in kwargs:
                                            kwargs["messages"] = messages
                                        else:
                                            args = (args[0], messages) + args[2:]
                                    else:
                                        user_prompt = f"{decision.inject_system_instruction}\n{user_prompt}"
                                        if "prompt" in kwargs:
                                            kwargs["prompt"] = user_prompt
                                        else:
                                            args = (args[0], user_prompt) + args[2:]
                        except Exception as e:
                            if decision and decision.action == "block":
                                raise e
                            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                                raise e
                            print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)
                            
                        resp = self._call_with_resilience(
                            lambda: original_method(*args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        if kwargs.get("stream") is True:
                            return self._wrap_ollama_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt, model, is_chat)
                            
                        try:
                            self._log_ollama_response(model, kwargs, resp, user_prompt, system_prompt)
                        except Exception as e:
                            print(f"[Aurex SDK Patch Error] Ollama patch failed: {e}", file=sys.stderr)
                        return resp
                    return patched_method

            # Patch module-level functions
            if hasattr(ollama, "chat") and not getattr(ollama.chat, "__aurex_patched__", False):
                patched = make_patched_method(ollama.chat, is_chat=True, is_async=False)
                patched.__aurex_patched__ = True
                ollama.chat = patched
            if hasattr(ollama, "generate") and not getattr(ollama.generate, "__aurex_patched__", False):
                patched = make_patched_method(ollama.generate, is_chat=False, is_async=False)
                patched.__aurex_patched__ = True
                ollama.generate = patched

            # Patch Client methods
            if hasattr(ollama, "Client"):
                if hasattr(ollama.Client, "chat") and not getattr(ollama.Client.chat, "__aurex_patched__", False):
                    patched = make_patched_method(ollama.Client.chat, is_chat=True, is_async=False)
                    patched.__aurex_patched__ = True
                    ollama.Client.chat = patched
                if hasattr(ollama.Client, "generate") and not getattr(ollama.Client.generate, "__aurex_patched__", False):
                    patched = make_patched_method(ollama.Client.generate, is_chat=False, is_async=False)
                    patched.__aurex_patched__ = True
                    ollama.Client.generate = patched

            # Patch AsyncClient methods
            if hasattr(ollama, "AsyncClient"):
                if hasattr(ollama.AsyncClient, "chat") and not getattr(ollama.AsyncClient.chat, "__aurex_patched__", False):
                    patched = make_patched_method(ollama.AsyncClient.chat, is_chat=True, is_async=True)
                    patched.__aurex_patched__ = True
                    ollama.AsyncClient.chat = patched
                if hasattr(ollama.AsyncClient, "generate") and not getattr(ollama.AsyncClient.generate, "__aurex_patched__", False):
                    patched = make_patched_method(ollama.AsyncClient.generate, is_chat=False, is_async=True)
                    patched.__aurex_patched__ = True
                    ollama.AsyncClient.generate = patched

        except ImportError:
            pass

    def patch_huggingface(self):
        """
        Locally auto-instrument standard Hugging Face InferenceClient.
        """
        try:
            from huggingface_hub import InferenceClient, AsyncInferenceClient
            
            def make_patched_chat(original_chat, is_async):
                if is_async:
                    async def patched_chat(self_client, *args, **kwargs):
                        model = kwargs.get("model") or getattr(self_client, "model", "unknown") or "unknown"
                        messages = kwargs.get("messages") or (args[0] if len(args) > 0 else [])
                        
                        user_prompt = ""
                        system_prompt = ""
                        for m in messages:
                            role = m.get("role") if isinstance(m, dict) else getattr(m, "role", None)
                            content = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
                            if role == "system":
                                system_prompt = content
                            elif role == "user":
                                user_prompt = content
                                
                        ctx = aurex_context.get()
                        workflow_id = ctx.get("workflow_id") or "default_workflow"
                        
                        decision = self.pre_call_check(
                            model=model,
                            prompt=user_prompt,
                            system_prompt=system_prompt,
                            workflow_id=workflow_id,
                            messages=messages
                        )
                        
                        if decision.action == "block":
                            raise Exception(f"[Aurex] Blocked: {decision.reason}")
                        if decision.action == "downgrade" and decision.suggested_model:
                            kwargs["model"] = decision.suggested_model
                        
                        resp = await self._acall_with_resilience(
                            lambda: original_chat(self_client, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        if kwargs.get("stream") is True:
                            async def async_stream_generator():
                                accumulated = []
                                async for chunk in resp:
                                    text = ""
                                    if hasattr(chunk, "choices") and chunk.choices:
                                        text = chunk.choices[0].delta.content or ""
                                    yield chunk
                                    if text:
                                        accumulated.append(text)
                                full_resp = "".join(accumulated)
                                self.record_response(workflow_id, full_resp)
                                self.log_event(
                                    model=kwargs.get("model", model),
                                    prompt=user_prompt,
                                    response=full_resp,
                                    input_tokens=self._estimate_tokens(user_prompt, messages),
                                    output_tokens=max(1, len(full_resp) // 4),
                                    workflow_id=workflow_id,
                                    system_prompt=system_prompt,
                                    provider="huggingface"
                                )
                            return async_stream_generator()
                            
                        input_tokens = 0
                        output_tokens = 0
                        response_content = ""
                        
                        if hasattr(resp, "usage") and resp.usage:
                            input_tokens = getattr(resp.usage, "prompt_tokens", 0)
                            output_tokens = getattr(resp.usage, "completion_tokens", 0)
                        else:
                            input_tokens = self._estimate_tokens(user_prompt, messages)
                            
                        if hasattr(resp, "choices") and resp.choices:
                            response_content = resp.choices[0].message.content or ""
                            if not output_tokens:
                                output_tokens = max(1, len(response_content) // 4)
                                
                        self.record_response(workflow_id, response_content)
                        self.log_event(
                            model=kwargs.get("model", model),
                            prompt=user_prompt,
                            response=response_content,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            workflow_id=workflow_id,
                            system_prompt=system_prompt,
                            provider="huggingface"
                        )
                        return resp
                    return patched_chat
                else:
                    def patched_chat(self_client, *args, **kwargs):
                        model = kwargs.get("model") or getattr(self_client, "model", "unknown") or "unknown"
                        messages = kwargs.get("messages") or (args[0] if len(args) > 0 else [])
                        
                        user_prompt = ""
                        system_prompt = ""
                        for m in messages:
                            role = m.get("role") if isinstance(m, dict) else getattr(m, "role", None)
                            content = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
                            if role == "system":
                                system_prompt = content
                            elif role == "user":
                                user_prompt = content
                                
                        ctx = aurex_context.get()
                        workflow_id = ctx.get("workflow_id") or "default_workflow"
                        
                        decision = self.pre_call_check(
                            model=model,
                            prompt=user_prompt,
                            system_prompt=system_prompt,
                            workflow_id=workflow_id,
                            messages=messages
                        )
                        
                        if decision.action == "block":
                            raise Exception(f"[Aurex] Blocked: {decision.reason}")
                        if decision.action == "downgrade" and decision.suggested_model:
                            kwargs["model"] = decision.suggested_model
                            
                        resp = self._call_with_resilience(
                            lambda: original_chat(self_client, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        if kwargs.get("stream") is True:
                            def sync_stream_generator():
                                accumulated = []
                                for chunk in resp:
                                    text = ""
                                    if hasattr(chunk, "choices") and chunk.choices:
                                        text = chunk.choices[0].delta.content or ""
                                    yield chunk
                                    if text:
                                        accumulated.append(text)
                                full_resp = "".join(accumulated)
                                self.record_response(workflow_id, full_resp)
                                self.log_event(
                                    model=kwargs.get("model", model),
                                    prompt=user_prompt,
                                    response=full_resp,
                                    input_tokens=self._estimate_tokens(user_prompt, messages),
                                    output_tokens=max(1, len(full_resp) // 4),
                                    workflow_id=workflow_id,
                                    system_prompt=system_prompt,
                                    provider="huggingface"
                                )
                            return sync_stream_generator()
                            
                        input_tokens = 0
                        output_tokens = 0
                        response_content = ""
                        
                        if hasattr(resp, "usage") and resp.usage:
                            input_tokens = getattr(resp.usage, "prompt_tokens", 0)
                            output_tokens = getattr(resp.usage, "completion_tokens", 0)
                        else:
                            input_tokens = self._estimate_tokens(user_prompt, messages)
                            
                        if hasattr(resp, "choices") and resp.choices:
                            response_content = resp.choices[0].message.content or ""
                            if not output_tokens:
                                output_tokens = max(1, len(response_content) // 4)
                                
                        self.record_response(workflow_id, response_content)
                        self.log_event(
                            model=kwargs.get("model", model),
                            prompt=user_prompt,
                            response=response_content,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            workflow_id=workflow_id,
                            system_prompt=system_prompt,
                            provider="huggingface"
                        )
                        return resp
                    return patched_chat

            def make_patched_gen(original_gen, is_async):
                if is_async:
                    async def patched_gen(self_client, *args, **kwargs):
                        model = kwargs.get("model") or getattr(self_client, "model", "unknown") or "unknown"
                        prompt = kwargs.get("prompt") or (args[0] if len(args) > 0 else "")
                        
                        ctx = aurex_context.get()
                        workflow_id = ctx.get("workflow_id") or "default_workflow"
                        
                        decision = self.pre_call_check(
                            model=model,
                            prompt=prompt,
                            workflow_id=workflow_id
                        )
                        
                        if decision.action == "block":
                            raise Exception(f"[Aurex] Blocked: {decision.reason}")
                        if decision.action == "downgrade" and decision.suggested_model:
                            kwargs["model"] = decision.suggested_model
                            
                        resp = await self._acall_with_resilience(
                            lambda: original_gen(self_client, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        if kwargs.get("stream") is True:
                            async def async_stream_generator():
                                accumulated = []
                                async for chunk in resp:
                                    text = chunk if isinstance(chunk, str) else getattr(chunk, "token", {}).get("text", "")
                                    yield chunk
                                    if text:
                                        accumulated.append(text)
                                full_resp = "".join(accumulated)
                                self.record_response(workflow_id, full_resp)
                                self.log_event(
                                    model=kwargs.get("model", model),
                                    prompt=prompt,
                                    response=full_resp,
                                    input_tokens=self._estimate_tokens(prompt),
                                    output_tokens=max(1, len(full_resp) // 4),
                                    workflow_id=workflow_id,
                                    provider="huggingface"
                                )
                            return async_stream_generator()
                            
                        response_content = ""
                        output_tokens = 0
                        input_tokens = self._estimate_tokens(prompt)
                        
                        if isinstance(resp, str):
                            response_content = resp
                        elif hasattr(resp, "generated_text"):
                            response_content = resp.generated_text
                            if hasattr(resp, "details") and resp.details and hasattr(resp.details, "generated_tokens"):
                                output_tokens = resp.details.generated_tokens
                                
                        if not output_tokens:
                            output_tokens = max(1, len(response_content) // 4)
                            
                        self.record_response(workflow_id, response_content)
                        self.log_event(
                            model=kwargs.get("model", model),
                            prompt=prompt,
                            response=response_content,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            workflow_id=workflow_id,
                            provider="huggingface"
                        )
                        return resp
                    return patched_gen
                else:
                    def patched_gen(self_client, *args, **kwargs):
                        model = kwargs.get("model") or getattr(self_client, "model", "unknown") or "unknown"
                        prompt = kwargs.get("prompt") or (args[0] if len(args) > 0 else "")
                        
                        ctx = aurex_context.get()
                        workflow_id = ctx.get("workflow_id") or "default_workflow"
                        
                        decision = self.pre_call_check(
                            model=model,
                            prompt=prompt,
                            workflow_id=workflow_id
                        )
                        
                        if decision.action == "block":
                            raise Exception(f"[Aurex] Blocked: {decision.reason}")
                        if decision.action == "downgrade" and decision.suggested_model:
                            kwargs["model"] = decision.suggested_model
                            
                        resp = self._call_with_resilience(
                            lambda: original_gen(self_client, *args, **kwargs),
                            provider=extract_provider(kwargs.get('model', 'unknown')),
                            workflow_id=workflow_id,
                            model=kwargs.get('model', 'unknown'),
                        )
                            
                        if kwargs.get("stream") is True:
                            def sync_stream_generator():
                                accumulated = []
                                for chunk in resp:
                                    text = chunk if isinstance(chunk, str) else getattr(chunk, "token", {}).get("text", "")
                                    yield chunk
                                    if text:
                                        accumulated.append(text)
                                full_resp = "".join(accumulated)
                                self.record_response(workflow_id, full_resp)
                                self.log_event(
                                    model=kwargs.get("model", model),
                                    prompt=prompt,
                                    response=full_resp,
                                    input_tokens=self._estimate_tokens(prompt),
                                    output_tokens=max(1, len(full_resp) // 4),
                                    workflow_id=workflow_id,
                                    provider="huggingface"
                                )
                            return sync_stream_generator()
                            
                        response_content = ""
                        output_tokens = 0
                        input_tokens = self._estimate_tokens(prompt)
                        
                        if isinstance(resp, str):
                            response_content = resp
                        elif hasattr(resp, "generated_text"):
                            response_content = resp.generated_text
                            if hasattr(resp, "details") and resp.details and hasattr(resp.details, "generated_tokens"):
                                output_tokens = resp.details.generated_tokens
                                
                        if not output_tokens:
                            output_tokens = max(1, len(response_content) // 4)
                            
                        self.record_response(workflow_id, response_content)
                        self.log_event(
                            model=kwargs.get("model", model),
                            prompt=prompt,
                            response=response_content,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            workflow_id=workflow_id,
                            provider="huggingface"
                        )
                        return resp
                    return patched_gen

            if hasattr(InferenceClient, "chat_completion") and not getattr(InferenceClient.chat_completion, "__aurex_patched__", False):
                patched = make_patched_chat(InferenceClient.chat_completion, is_async=False)
                patched.__aurex_patched__ = True
                InferenceClient.chat_completion = patched
            if hasattr(InferenceClient, "text_generation") and not getattr(InferenceClient.text_generation, "__aurex_patched__", False):
                patched = make_patched_gen(InferenceClient.text_generation, is_async=False)
                patched.__aurex_patched__ = True
                InferenceClient.text_generation = patched
                
            if hasattr(AsyncInferenceClient, "chat_completion") and not getattr(AsyncInferenceClient.chat_completion, "__aurex_patched__", False):
                patched = make_patched_chat(AsyncInferenceClient.chat_completion, is_async=True)
                patched.__aurex_patched__ = True
                AsyncInferenceClient.chat_completion = patched
            if hasattr(AsyncInferenceClient, "text_generation") and not getattr(AsyncInferenceClient.text_generation, "__aurex_patched__", False):
                patched = make_patched_gen(AsyncInferenceClient.text_generation, is_async=True)
                patched.__aurex_patched__ = True
                AsyncInferenceClient.text_generation = patched

        except ImportError:
            pass

    def patch_all(self):
        """Auto-patch all supported provider libraries."""
        self.patch_litellm()
        self.patch_anthropic()
        self.patch_openai()
        self.patch_google()
        self.patch_ollama()
        self.patch_huggingface()
