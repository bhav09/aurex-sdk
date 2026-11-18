import threading
import time
import json
import urllib.request
import urllib.error
import sys
from typing import Optional, Any

class PolicySyncThread:
    """
    Background daemon thread that asynchronously fetches compiled rules,
    budget thresholds, and pricing tables from the Aurex cloud every 5 minutes.
    """
    def __init__(self, auditor: Any, endpoint: str, api_key: str, interval_seconds: int = 300):
        self.auditor = auditor
        self.endpoint = endpoint
        self.api_key = api_key
        self.interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        if not self._thread or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2.0)

    def _run_loop(self):
        # Initial sync on startup
        self._sync()
        while not self._stop_event.is_set():
            # Wait for interval or until stopped
            if self._stop_event.wait(self.interval_seconds):
                break
            self._sync()

    def _sync(self):
        try:
            req = urllib.request.Request(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Accept": "application/json"
                }
            )
            with urllib.request.urlopen(req, timeout=10.0) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                # Apply rules to auditor
                if "pricing" in data:
                    for model, costs in data["pricing"].items():
                        self.auditor.register_model_pricing(model, costs.get("input", 0.0), costs.get("output", 0.0))
                
                if "budget_guard" in data and data["budget_guard"]:
                    self.auditor.configure_circuit_breaker(data["budget_guard"])

                if "tenant_policies" in data and isinstance(data["tenant_policies"], dict):
                    if hasattr(self.auditor, "configure_tenant_policies"):
                        self.auditor.configure_tenant_policies(data["tenant_policies"])
                    
        except Exception as e:
            # Silently fail in background, optionally log in debug mode
            if hasattr(self.auditor, "_debug_log"):
                self.auditor._debug_log(f"Policy sync failed: {e}")
