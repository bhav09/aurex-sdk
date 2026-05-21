import os
import sys
import json
import queue
import threading
import time
import hashlib
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
import urllib.request
import urllib.error

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
        cloud_endpoint: str = "http://localhost:8000/api/v1/upload/csv",
        flush_interval_seconds: float = 1.0,
        max_batch_size: int = 50,
        local_only: bool = True,
        storage_mode: str = "file" # "file" or "memory"
    ):
        self.api_key = api_key or os.getenv("AUREX_API_KEY")
        self.project = project
        self.ledger_path = ledger_path
        self.cloud_sync = cloud_sync
        self.cloud_endpoint = cloud_endpoint
        self.flush_interval_seconds = flush_interval_seconds
        self.max_batch_size = max_batch_size
        self.local_only = local_only
        self.storage_mode = storage_mode


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
        
        # Create ledger folder structure if not exists (only if file storage mode)
        if self.config.storage_mode == "file":
            ledger_dir = os.path.dirname(self.config.ledger_path)
            if ledger_dir and not os.path.exists(ledger_dir):
                try:
                    os.makedirs(ledger_dir, exist_ok=True)
                except Exception as e:
                    print(f"[Aurex Warning] Could not create ledger directory: {e}", file=sys.stderr)

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
        extra_metadata: Optional[Dict[str, Any]] = None
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
        now = datetime.utcnow().isoformat() + "Z"
        
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
            "extra_metadata": extra_metadata or {}
        }
        
        # Push to async worker queue - returns immediately, taking < 0.1 ms
        self._queue.put(event)

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
        """Transmit hashed metadata to the cloud backend asynchronously"""
        try:
            # Prepare payload
            payload = {
                "project": self.config.project,
                "data": batch
            }
            req_data = json.dumps(payload).encode("utf-8")
            
            # Non-blocking simple HTTP request
            req = urllib.request.Request(
                self.config.cloud_endpoint,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.api_key}"
                },
                method="POST"
            )
            # Timeout quickly to avoid hanging background thread
            with urllib.request.urlopen(req, timeout=3.0) as response:
                response.read()
        except Exception as e:
            # Fail silently to not impact production application
            pass

    def shutdown(self):
        """Flush the queue and terminate background worker thread"""
        self._stop_event.set()
        if self._thread.is_alive():
            self._thread.join(timeout=3.0)
            
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
        Any LLM requests made via 'openai' will automatically be parsed & audited.
        """
        try:
            import openai
            
            # Patch sync completions
            original_create = openai.resources.chat.completions.Completions.create
            
            def patched_create(cls_self, *args, **kwargs):
                resp = original_create(cls_self, *args, **kwargs)
                try:
                    self._log_openai_response(kwargs, resp)
                except Exception as e:
                    import sys
                    print(f"[Aurex SDK Patch Error] OpenAI patch failed: {e}", file=sys.stderr)
                return resp
            
            openai.resources.chat.completions.Completions.create = patched_create

            # Patch async completions
            original_acreate = openai.resources.chat.completions.AsyncCompletions.create
            
            async def patched_acreate(cls_self, *args, **kwargs):
                resp = await original_acreate(cls_self, *args, **kwargs)
                try:
                    self._log_openai_response(kwargs, resp)
                except Exception as e:
                    import sys
                    print(f"[Aurex SDK Patch Error] OpenAI async patch failed: {e}", file=sys.stderr)
                return resp
                
            openai.resources.chat.completions.AsyncCompletions.create = patched_acreate
        except ImportError:
            pass

    def _log_openai_response(self, kwargs: Dict[str, Any], resp: Any):
        """Parses OpenAI call metadata, extracts system/user prompt details, hashes them locally, and logs them"""
        model = kwargs.get("model", "unknown")
        
        # Capture token usage including cache and reasoning breakdowns
        input_tokens = 0
        output_tokens = 0
        cached_tokens = 0
        reasoning_tokens = 0
        if hasattr(resp, "usage") and resp.usage:
            input_tokens = resp.usage.prompt_tokens or 0
            output_tokens = resp.usage.completion_tokens or 0
            
            # Extract cached token details (OpenAI prompt_tokens_details.cached_tokens)
            if hasattr(resp.usage, "prompt_tokens_details") and resp.usage.prompt_tokens_details:
                cached_tokens = getattr(resp.usage.prompt_tokens_details, "cached_tokens", 0) or 0
            
            # Extract reasoning token details (o1/o3 series completion_tokens_details.reasoning_tokens)
            if hasattr(resp.usage, "completion_tokens_details") and resp.usage.completion_tokens_details:
                reasoning_tokens = getattr(resp.usage.completion_tokens_details, "reasoning_tokens", 0) or 0
            
        # Parse prompt & system prompt
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

        # Extracted session / workflow tag
        workflow_id = kwargs.get("user") or kwargs.get("metadata", {}).get("workflow_id")
        
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
        Any LLM requests made via 'anthropic' will automatically be parsed & audited.
        """
        try:
            import anthropic
            
            # Patch sync messages
            original_create = anthropic.resources.messages.Messages.create
            
            def patched_create(cls_self, *args, **kwargs):
                resp = original_create(cls_self, *args, **kwargs)
                try:
                    self._log_anthropic_response(kwargs, resp)
                except Exception as e:
                    import sys
                    print(f"[Aurex SDK Patch Error] Anthropic patch failed: {e}", file=sys.stderr)
                return resp
            
            anthropic.resources.messages.Messages.create = patched_create

            # Patch async messages
            original_acreate = anthropic.resources.messages.AsyncMessages.create
            
            async def patched_acreate(cls_self, *args, **kwargs):
                resp = await original_acreate(cls_self, *args, **kwargs)
                try:
                    self._log_anthropic_response(kwargs, resp)
                except Exception as e:
                    import sys
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

        workflow_id = kwargs.get("metadata", {}).get("workflow_id") or kwargs.get("user")
        
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
            extra_metadata=kwargs.get("metadata")
        )

    def patch_google(self):
        """
        Locally auto-instrument standard Google Gemini generation.
        Any LLM requests made via 'google.generativeai' will automatically be parsed & audited.
        """
        try:
            import google.generativeai as genai
            
            # Patch sync generate_content
            original_generate = genai.GenerativeModel.generate_content
            
            def patched_generate(model_self, *args, **kwargs):
                resp = original_generate(model_self, *args, **kwargs)
                try:
                    self._log_google_response(model_self, args, kwargs, resp)
                except Exception as e:
                    import sys
                    print(f"[Aurex SDK Patch Error] Google patch failed: {e}", file=sys.stderr)
                return resp
            
            genai.GenerativeModel.generate_content = patched_generate

            # Patch async generate_content
            original_generate_async = genai.GenerativeModel.generate_content_async
            
            async def patched_generate_async(model_self, *args, **kwargs):
                resp = await original_generate_async(model_self, *args, **kwargs)
                try:
                    self._log_google_response(model_self, args, kwargs, resp)
                except Exception as e:
                    import sys
                    print(f"[Aurex SDK Patch Error] Google async patch failed: {e}", file=sys.stderr)
                return resp
                
            genai.GenerativeModel.generate_content_async = patched_generate_async
        except ImportError:
            pass

    def _log_google_response(self, model_self: Any, args: tuple, kwargs: Dict[str, Any], resp: Any):
        """Parses Google Gemini response metadata, hashes prompts locally, and logs them"""
        model = getattr(model_self, "model_name", "gemini-1.5-flash")
        
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

        workflow_id = kwargs.get("metadata", {}).get("workflow_id")
        
        self.log_event(
            model=model,
            prompt=user_prompt,
            response=response_content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            extra_metadata=kwargs.get("metadata")
        )

    def patch_all(self):
        """Auto-patch all supported provider libraries (OpenAI, Anthropic, Google Gemini)"""
        self.patch_openai()
        self.patch_anthropic()
        self.patch_google()
