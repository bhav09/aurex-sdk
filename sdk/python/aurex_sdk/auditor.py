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

# In-memory database of pricing
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "gpt-5": {"input": 5.00, "output": 15.00},
    "gpt-5.1": {"input": 5.00, "output": 15.00},
    "o3-mini": {"input": 1.10, "output": 4.40},
    "o1": {"input": 15.00, "output": 60.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-2.5-flash": {"input": 0.10, "output": 0.40},
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude-3-opus": {"input": 15.00, "output": 75.00},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-5-20250929": {"input": 3.00, "output": 15.00},
    "claude-3-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-sonnet-20240229": {"input": 3.00, "output": 15.00},
    "claude-3-5-haiku": {"input": 0.80, "output": 4.00},
    "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "claude-3-7-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-7-sonnet-20250219": {"input": 3.00, "output": 15.00},
    "llama3.1:70b": {"input": 0.0, "output": 0.0},
    "llama3.1:8b": {"input": 0.0, "output": 0.0},
    "qwen2.5:72b": {"input": 0.0, "output": 0.0},
    "mistral:7b": {"input": 0.0, "output": 0.0},
}

def normalize_model_name(m: str) -> str:
    m = m.strip().lower()
    import re
    # Strip fine-tuned model prefixes (e.g. "ft:gpt-4o-mini-2024-07-18:my-org::abc123" → "gpt-4o-mini-2024-07-18")
    ft_match = re.match(r'^ft:([^:]+)', m)
    if ft_match:
        m = ft_match.group(1)
    # Remove vendor prefixes/common prefixes
    m = re.sub(r'^(models\/|publishers\/google\/models\/|anthropic\.|amazon\.|bedrock\/)', '', m)
    m = re.sub(r'[\s_]+', '-', m)
    return m

def get_model_pricing(model: str) -> Tuple[float, float]:
    if not model:
        return 1.50, 6.00
    query_norm = normalize_model_name(model)
    pricing = MODEL_PRICING.get(query_norm)
    if pricing:
        return pricing["input"], pricing["output"]
    sorted_keys = sorted(MODEL_PRICING.keys(), key=len, reverse=True)
    for key in sorted_keys:
        if key in query_norm:
            return MODEL_PRICING[key]["input"], MODEL_PRICING[key]["output"]
    # Moderate fallback — avoids extreme overcharging for unknown/new models
    return 1.50, 6.00

def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    cache_write_tokens: int = 0,
    is_batch: bool = False,
) -> float:
    """
    Cache-aware cost calculation.
    - cached_tokens: tokens served from provider cache
    - cache_write_tokens: tokens written to cache
    - is_batch: if True, applies 50% discount (OpenAI Batch API)
    """
    input_price, output_price = get_model_pricing(model)
    provider = extract_provider(model)
    
    # Separate cached vs non-cached input tokens
    non_cached_input = max(0, input_tokens - cached_tokens - cache_write_tokens)
    
    # Cache pricing multipliers
    cache_read_mult = 1.0
    cache_create_mult = 1.0
    
    if provider == "anthropic":
        cache_read_mult = 0.10
        cache_create_mult = 1.25
    elif provider == "openai":
        cache_read_mult = 0.50
        cache_create_mult = 1.0
    elif provider == "google":
        cache_read_mult = 0.25
        cache_create_mult = 1.0
    else:
        cache_read_mult = 0.25
        cache_create_mult = 1.0
        
    cost = (
        (non_cached_input / 1_000_000 * input_price) +
        (cached_tokens / 1_000_000 * input_price * cache_read_mult) +
        (cache_write_tokens / 1_000_000 * input_price * cache_create_mult) +
        (output_tokens / 1_000_000 * output_price)
    )
    
    if is_batch:
        cost *= 0.50  # 50% Batch API discount
    
    return cost

def extract_provider(model: str) -> str:
    model_lower = model.lower()
    if "claude" in model_lower:
        return "anthropic"
    elif "gpt" in model_lower or model_lower.startswith("o1") or model_lower.startswith("o3"):
        return "openai"
    elif "gemini" in model_lower:
        return "google"
    elif any(x in model_lower for x in ["llama", "mistral", "qwen"]):
        return "ollama"
    return "unknown"


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
        sync_prompt_hashes: bool = False
    ):
        self.api_key = api_key or os.getenv("AUREX_API_KEY")
        self.project = project
        self.ledger_path = ledger_path
        self.cloud_sync = cloud_sync
        self.sync_prompt_hashes = sync_prompt_hashes or (os.getenv("AUREX_SYNC_PROMPT_HASHES", "0") in ("1", "true", "True"))
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
            return
        self.config = config or AurexConfig()
        self._queue = queue.Queue()
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
        self._budget_config = self.config.budget_guard or {}
        
        # Create ledger folder structure if not exists (only if file storage mode)
        if self.config.storage_mode == "file":
            ledger_dir = os.path.dirname(self.config.ledger_path)
            if ledger_dir and not os.path.exists(ledger_dir):
                try:
                    os.makedirs(ledger_dir, exist_ok=True)
                except Exception as e:
                    print(f"[Aurex Warning] Could not create ledger directory: {e}", file=sys.stderr)

            # Queue crash recovery
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
        self._initialized = True

    def get_local_events(self) -> List[Dict[str, Any]]:
        """Return locally buffered events in memory"""
        with self._lock:
            return list(self._memory_events)

    def clear_local_events(self):
        """Clear local memory buffer"""
        with self._lock:
            self._memory_events = []

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
        cost_type: Optional[str] = None
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

        # Cache-aware local cost calculation
        cost = calculate_cost(
            model, input_tokens, output_tokens,
            cached_tokens=cached_tokens,
            cache_write_tokens=cache_write_tokens,
            is_batch=is_batch
        )
        provider = extract_provider(model)

        event = {
            "timestamp": now,
            "provider": provider,
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
            "system_prompt_hash": system_prompt_hash,
            "prompt_hash": prompt_hash,
            "response_hash": response_hash,
            "extra_metadata": extra_metadata or {},
            "retry_count": retry_count,
            "outcome": outcome,
            "cost_type": cost_type
        }
        
        # Track metrics for sliding window and session tracking under lock
        with self._lock:
            self._last_minute_events.append({"timestamp": time.time(), "cost": cost})
            if workflow_id:
                self._session_costs[workflow_id] = self._session_costs.get(workflow_id, 0) + cost

        # Push to async worker queue - returns immediately, taking < 0.1 ms
        self._queue.put(event)

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

    def _estimate_tokens(self, prompt: Optional[str] = None, messages: Optional[List[Dict[str, Any]]] = None) -> int:
        if messages:
            total_chars = 0
            for m in messages:
                content = m.get("content")
                if isinstance(content, str):
                    total_chars += len(content)
            return max(1, total_chars // 4)
        if prompt:
            return max(1, len(prompt) // 4)
        return 1

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

    def wrap(self, call_fn, build_params):
        """
        High-level wrapper mirroring Node SDK's wrap().
        """
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
                    
        workflow_id = params.get("user") or (params.get("metadata", {}).get("workflow_id") if isinstance(params.get("metadata"), dict) else None) or "default_workflow"
        
        decision = self.pre_call_check(
            model=model,
            prompt=user_prompt,
            system_prompt=system_prompt,
            workflow_id=workflow_id,
            messages=messages
        )
        
        modified_params = apply_decision_to_call_params(params, decision)
        
        try:
            resp = call_fn(modified_params)
        except Exception as ex:
            self.mark_failure(workflow_id, str(ex))
            raise ex
            
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

    async def awrap(self, call_fn, build_params):
        """
        Asynchronous high-level wrapper.
        """
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
                    
        workflow_id = params.get("user") or (params.get("metadata", {}).get("workflow_id") if isinstance(params.get("metadata"), dict) else None) or "default_workflow"
        
        decision = self.pre_call_check(
            model=model,
            prompt=user_prompt,
            system_prompt=system_prompt,
            workflow_id=workflow_id,
            messages=messages
        )
        
        modified_params = apply_decision_to_call_params(params, decision)
        
        try:
            resp = await call_fn(modified_params)
        except Exception as ex:
            self.mark_failure(workflow_id, str(ex))
            raise ex
            
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
        with self._lock:
            return {
                "sync_error_count": self._sync_error_count,
                "last_sync_error": self._last_sync_error,
                "session_costs_tracked": len(self._session_costs),
                "queue_size": self._queue.qsize()
            }

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

    def _wrap_sync_stream(self, stream, kwargs, workflow_id, user_prompt, system_prompt):
        accumulated_content = []
        final_usage = None
        
        for chunk in stream:
            text = self._extract_chunk_text(chunk)
            if text:
                accumulated_content.append(text)
            if hasattr(chunk, "usage") and chunk.usage:
                final_usage = chunk.usage
            yield chunk
            
        full_content = "".join(accumulated_content)
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
            input_tokens = self._estimate_tokens(user_prompt, kwargs.get("messages"))
            output_tokens = max(1, len(full_content) // 4)
            
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
            extra_metadata=kwargs.get("metadata")
        )

    async def _wrap_async_stream(self, stream, kwargs, workflow_id, user_prompt, system_prompt):
        accumulated_content = []
        final_usage = None
        
        async for chunk in stream:
            text = self._extract_chunk_text(chunk)
            if text:
                accumulated_content.append(text)
            if hasattr(chunk, "usage") and chunk.usage:
                final_usage = chunk.usage
            yield chunk
            
        full_content = "".join(accumulated_content)
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
            input_tokens = self._estimate_tokens(user_prompt, kwargs.get("messages"))
            output_tokens = max(1, len(full_content) // 4)
            
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
            extra_metadata=kwargs.get("metadata")
        )

    def pre_call_check(
        self,
        model: str,
        prompt: Optional[str] = None,
        system_prompt: Optional[str] = None,
        workflow_id: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None,
        retry_count: Optional[int] = None
    ) -> AurexDecision:
        """
        Perform real-time pre-call checks on the outgoing LLM request.
        Checks for:
        1. System Prompt Waste
        2. Agent Runaway Loop
        3. Over-provisioned Model Misuse
        4. Context Explosion
        5. Semantic Loops
        """
        now = time.time()
        workflow_id = workflow_id or os.environ.get("AUREX_WORKFLOW_ID") or "default_workflow"
        
        est_tokens = self._estimate_tokens(prompt, messages)
        prompt_hash = None
        if prompt:
            prompt_hash = hashlib.sha256(prompt.encode('utf-8')).hexdigest()
        sys_prompt_hash = None
        if system_prompt:
            sys_prompt_hash = hashlib.sha256(system_prompt.encode('utf-8')).hexdigest()

        req_meta = {
            "timestamp": now,
            "model": model,
            "workflow_id": workflow_id,
            "system_prompt_hash": sys_prompt_hash,
            "prompt_hash": prompt_hash,
            "estimated_tokens": est_tokens
        }

        with self._lock:
            self._recent_requests = [r for r in self._recent_requests if now - r["timestamp"] < 300]
            self._recent_requests.append(req_meta)
            if len(self._recent_requests) > 200:
                self._recent_requests.pop(0)
            workflow_requests = [r for r in self._recent_requests if r["workflow_id"] == workflow_id]

        decision = AurexDecision(action="proceed", reason="ok", original_model=model)

        with self._lock:
            if workflow_id in self._ignored_workflows:
                return decision

        input_price, output_price = get_model_pricing(model)
        predicted_cost = (est_tokens / 1_000_000) * input_price
        
        budget_exceeded = False
        reason = ""
        
        max_cost_ps = self._budget_config.get("max_cost_per_session")
        if workflow_id and max_cost_ps is not None:
            with self._lock:
                current_session_cost = self._session_costs.get(workflow_id, 0.0)
            if current_session_cost + predicted_cost > max_cost_ps:
                budget_exceeded = True
                reason += f"Predicted cost ${predicted_cost:.4f} plus session cost ${current_session_cost:.4f} exceeds session limit of ${max_cost_ps:.4f}. "

        max_cost_pm = self._budget_config.get("max_cost_per_minute")
        if max_cost_pm is not None:
            with self._lock:
                minute_cost = sum(e["cost"] for e in self._last_minute_events)
            if minute_cost + predicted_cost > max_cost_pm:
                budget_exceeded = True
                reason += f"Predicted cost ${predicted_cost:.4f} plus minute cost ${minute_cost:.4f} exceeds minute limit of ${max_cost_pm:.4f}. "

        max_reqs_pm = self._budget_config.get("max_requests_per_minute")
        if max_reqs_pm is not None:
            with self._lock:
                minute_requests = len(self._last_minute_events)
            if minute_requests + 1 > max_reqs_pm:
                budget_exceeded = True
                reason += f"Adding this request would exceed minute requests limit of {max_reqs_pm}. "

        max_ctx_toks = self._budget_config.get("max_context_tokens")
        if max_ctx_toks is not None and est_tokens > max_ctx_toks:
            budget_exceeded = True
            reason += f"Estimated input tokens {est_tokens} exceeds maximum context token limit of {max_ctx_toks}. "
            
        if budget_exceeded:
            decision = AurexDecision(
                action="block",
                reason=reason.strip(),
                original_model=model
            )

        if decision.action != "block":
            retry_count_val = retry_count if retry_count is not None else self._session_retry_counts.get(workflow_id, 0)
            loop_score = self._compute_semantic_loop_score(workflow_id, prompt or "")

            if sys_prompt_hash and len(workflow_requests) >= 2:
                previous_sends = [r for r in workflow_requests[:-1] if r["system_prompt_hash"] == sys_prompt_hash]
                if previous_sends and messages:
                    decision = AurexDecision(
                        action="compress",
                        reason=f"System prompt waste in workflow '{workflow_id}'",
                        compressed_messages=compress_messages(messages),
                        original_model=model
                    )

            if len(workflow_requests) >= 3 and decision.action == "proceed":
                recent_workflow_reqs = workflow_requests[-3:]
                sizes = [r["estimated_tokens"] for r in recent_workflow_reqs]
                if sizes[1] >= sizes[0] * 2.2 and sizes[2] >= sizes[1] * 2.2 and sizes[0] > 20:
                    cheaper = suggest_cheaper_model(model)
                    decision = AurexDecision(
                        action="downgrade",
                        reason=f"Runaway context growth in '{workflow_id}'",
                        suggested_model=cheaper,
                        inject_system_instruction="Summarize prior context briefly, then continue with a shorter answer.",
                        original_model=model,
                        loop_score=loop_score
                    )
                    with self._lock:
                        self._session_retry_counts[workflow_id] = self._session_retry_counts.get(workflow_id, 0) + 1

            is_simple = est_tokens < 150
            with self._lock:
                session_cost = self._session_costs.get(workflow_id, 0.0)
            near_budget = (
                self._budget_config.get("max_cost_per_session") is not None
                and session_cost > (self._budget_config["max_cost_per_session"] * 0.8)
            )
            if ((is_expensive_model(model) and is_simple) or near_budget) and decision.action == "proceed":
                recommended = suggest_cheaper_model(model)
                if recommended:
                    decision = AurexDecision(
                        action="downgrade",
                        reason=f"Budget threshold near for '{workflow_id}'" if near_budget else f"Over-provisioned model for simple task (~{est_tokens} tokens)",
                        suggested_model=recommended,
                        original_model=model
                    )

            if len(workflow_requests) >= 2 and messages and decision.action == "proceed":
                initial_size = workflow_requests[0]["estimated_tokens"]
                current_size = est_tokens
                if initial_size > 0 and current_size >= initial_size * 3.5:
                    decision = AurexDecision(
                        action="compress",
                        reason=f"Context explosion in '{workflow_id}' ({initial_size} -> {current_size} est. tokens)",
                        compressed_messages=compress_messages(messages),
                        original_model=model
                    )

            if loop_score >= 0.8:
                decision = AurexDecision(
                    action="compress",
                    reason=f"Semantic loop detected (score {loop_score:.2f})",
                    loop_score=loop_score,
                    inject_system_instruction="You appear to be repeating yourself. Summarize your current state and try a different approach.",
                    compressed_messages=compress_messages(messages) if messages else None,
                    original_model=model
                )

            if retry_count_val >= 3 and (loop_score >= 0.7 or decision.action != "proceed"):
                with self._lock:
                    session_cost = self._session_costs.get(workflow_id, 0.0)
                self._maybe_escalate(workflow_id, session_cost, retry_count_val, loop_score, decision.reason)

        if decision.action != "proceed":
            mode = self._budget_config.get("on_budget_exceeded", "warn")
            if os.getenv("AUREX_BLOCK_ON_WASTE") == "1":
                mode = "throw"
                
            msg = f"[Aurex SDK] {decision.action}: {decision.reason}"
            if mode == "throw" and decision.action == "block":
                raise Exception(msg)
            elif mode != "throw":
                print(msg, file=sys.stderr)

        return decision

    def _check_budget(self, new_event_cost: float, input_tokens: int, workflow_id: Optional[str] = None):
        with self._lock:
            if not self._budget_config:
                return

            now = time.time()
            # Keep sliding 60s window
            self._last_minute_events = [e for e in self._last_minute_events if now - e["timestamp"] < 60]

            minute_cost = sum(e["cost"] for e in self._last_minute_events)
            minute_requests = len(self._last_minute_events)

            current_session_cost = 0
            if workflow_id:
                current_session_cost = self._session_costs.get(workflow_id, 0)

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
                    raise Exception(message)

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
        try:
            # Metadata-only sync: strip out hashes if sync_prompt_hashes is False
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
            req_data = json.dumps(payload).encode("utf-8")

            req = urllib.request.Request(
                endpoint,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.api_key}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=3.0) as response:
                response.read()
        except Exception as e:
            with self._lock:
                self._sync_error_count += 1
                self._last_sync_error = str(e)
            self._debug_log(f"Cloud sync failed: {e}")

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
            
            def patched_create(cls_self, *args, **kwargs):
                workflow_id = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None) or "default_workflow"
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
                        messages=messages
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                try:
                    resp = original_create(cls_self, *args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

                if kwargs.get("stream") is True:
                    return self._wrap_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_openai_response(kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] OpenAI patch failed: {e}", file=sys.stderr)
                return resp
            
            openai.resources.chat.completions.Completions.create = patched_create

            # Patch async completions
            original_acreate = openai.resources.chat.completions.AsyncCompletions.create
            
            async def patched_acreate(cls_self, *args, **kwargs):
                workflow_id = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None) or "default_workflow"
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
                        messages=messages
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                try:
                    resp = await original_acreate(cls_self, *args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

                if kwargs.get("stream") is True:
                    return self._wrap_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_openai_response(kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] OpenAI async patch failed: {e}", file=sys.stderr)
                return resp
                
            openai.resources.chat.completions.AsyncCompletions.create = patched_acreate
        except ImportError:
            pass

    def _log_openai_response(self, kwargs: Dict[str, Any], resp: Any):
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
        if hasattr(resp, "choices") and resp.choices:
            choice = resp.choices[0]
            if hasattr(choice, "message") and choice.message and hasattr(choice.message, "content"):
                response_content = choice.message.content

        workflow_id = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None) or "default_workflow"
        
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
            extra_metadata=kwargs.get("metadata")
        )

    def patch_anthropic(self):
        """
        Locally auto-instrument standard Anthropic message creation.
        """
        try:
            import anthropic
            
            # Patch sync messages
            original_create = anthropic.resources.messages.Messages.create
            
            def patched_create(cls_self, *args, **kwargs):
                workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else kwargs.get("user") or "default_workflow"
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
                        messages=messages
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                try:
                    resp = original_create(cls_self, *args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

                if kwargs.get("stream") is True:
                    return self._wrap_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_anthropic_response(kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] Anthropic patch failed: {e}", file=sys.stderr)
                return resp
            
            anthropic.resources.messages.Messages.create = patched_create

            # Patch async messages
            original_acreate = anthropic.resources.messages.AsyncMessages.create
            
            async def patched_acreate(cls_self, *args, **kwargs):
                workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else kwargs.get("user") or "default_workflow"
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
                        messages=messages
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                try:
                    resp = await original_acreate(cls_self, *args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

                if kwargs.get("stream") is True:
                    return self._wrap_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_anthropic_response(kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] Anthropic async patch failed: {e}", file=sys.stderr)
                return resp
                
            anthropic.resources.messages.AsyncMessages.create = patched_acreate
        except ImportError:
            pass

    def _log_anthropic_response(self, kwargs: Dict[str, Any], resp: Any):
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
        if hasattr(resp, "content") and resp.content:
            if isinstance(resp.content, list):
                response_content = "".join(
                    getattr(b, "text", str(b)) if not isinstance(b, str) else b
                    for b in resp.content
                )
            elif isinstance(resp.content, str):
                response_content = resp.content

        workflow_id = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else kwargs.get("user") or "default_workflow"
        
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
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None
        )

    def patch_google(self):
        """
        Locally auto-instrument standard Google Gemini generation.
        """
        try:
            import google.generativeai as genai
            
            # Patch sync generate_content
            original_generate = genai.GenerativeModel.generate_content
            
            def patched_generate(model_self, *args, **kwargs):
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

                try:
                    resp = original_generate(model_self, *args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

                is_stream = kwargs.get("stream") is True
                if is_stream:
                    return self._wrap_sync_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_google_response(model_self, args, kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] Google patch failed: {e}", file=sys.stderr)
                return resp
            
            genai.GenerativeModel.generate_content = patched_generate

            # Patch async generate_content
            original_generate_async = genai.GenerativeModel.generate_content_async
            
            async def patched_generate_async(model_self, *args, **kwargs):
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

                try:
                    resp = await original_generate_async(model_self, *args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

                is_stream = kwargs.get("stream") is True
                if is_stream:
                    return self._wrap_async_stream(resp, kwargs, workflow_id, user_prompt, system_prompt)

                try:
                    self._log_google_response(model_self, args, kwargs, resp)
                except Exception as e:
                    print(f"[Aurex SDK Patch Error] Google async patch failed: {e}", file=sys.stderr)
                return resp
                
            genai.GenerativeModel.generate_content_async = patched_generate_async
        except ImportError:
            pass

    def _log_google_response(self, model_self: Any, args: tuple, kwargs: Dict[str, Any], resp: Any):
        """Parses Google Gemini response metadata, hashes prompts locally, and logs them"""
        model = normalize_model_name(getattr(model_self, "model_name", "gemini-1.5-flash"))
        
        input_tokens = 0
        output_tokens = 0
        if hasattr(resp, "usage_metadata") and resp.usage_metadata:
            input_tokens = getattr(resp.usage_metadata, "prompt_token_count", 0) or 0
            output_tokens = getattr(resp.usage_metadata, "candidates_token_count", 0) or 0
            
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
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None
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
                workflow_id = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None) or "default_workflow"
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
                        messages=messages
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                try:
                    resp = original(*args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

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
                workflow_id = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None) or "default_workflow"
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
                        messages=messages
                    )
                    if decision:
                        kwargs = apply_decision_to_call_params(kwargs, decision)
                except Exception as e:
                    if decision and decision.action == "block":
                        raise e
                    if os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or self._budget_config.get("on_budget_exceeded") == "throw":
                        raise e
                    print(f"[Aurex SDK Real-Time Warning Check Error] {e}", file=sys.stderr)

                try:
                    resp = await original_a(*args, **kwargs)
                except Exception as ex:
                    self.mark_failure(workflow_id, str(ex))
                    raise ex

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

        workflow_id = kwargs.get("user") or (kwargs.get("metadata", {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None) or "default_workflow"

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

    def patch_all(self):
        """Auto-patch all supported provider libraries."""
        self.patch_litellm()
        self.patch_anthropic()
        self.patch_openai()
        self.patch_google()
