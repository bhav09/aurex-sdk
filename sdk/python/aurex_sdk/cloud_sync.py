"""Cloud sync transport with timeout, retry, and 429-aware backoff."""

from __future__ import annotations

import json
import random
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple


def sync_batch_with_retry(
    endpoint: str,
    payload: Dict[str, Any],
    api_key: str,
    *,
    timeout_seconds: float = 10.0,
    max_retries: int = 3,
) -> Tuple[bool, Optional[str]]:
    """POST JSON payload with bounded retries. Returns (success, error_message)."""
    req_data = json.dumps(payload).encode("utf-8")
    last_error: Optional[str] = None

    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                endpoint,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
                response.read()
            return True, None
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}: {exc.reason}"
            if exc.code == 429 and attempt < max_retries:
                retry_after = exc.headers.get("Retry-After", "1")
                try:
                    delay = float(retry_after)
                except ValueError:
                    delay = 1.0
                time.sleep(delay + random.uniform(0, 0.5))
                continue
            if exc.code >= 500 and attempt < max_retries:
                time.sleep((2**attempt) + random.uniform(0, 1))
                continue
            return False, last_error
        except Exception as exc:  # noqa: BLE001 - transport boundary
            last_error = str(exc)
            if attempt < max_retries:
                time.sleep((2**attempt) + random.uniform(0, 1))
                continue
            return False, last_error

    return False, last_error
