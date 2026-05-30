"""Lightweight auditor — ledger append + optional cloud sync."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


class AurexAuditor:
    _instance: Optional["AurexAuditor"] = None

    def __init__(
        self,
        api_key: Optional[str] = None,
        ledger_path: str = ".aurex/ledger.jsonl",
        cloud_sync: Optional[bool] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("AUREX_API_KEY", "")
        self.ledger_path = Path(ledger_path)
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        self.cloud_sync = cloud_sync if cloud_sync is not None else bool(self.api_key)
        self.base_url = (base_url or os.environ.get("AUREX_BASE_URL") or "http://localhost:8000/api/v1").rstrip("/")

    @classmethod
    def get_instance(cls, **kwargs: Any) -> "AurexAuditor":
        if cls._instance is None:
            cls._instance = cls(**kwargs)
        return cls._instance

    def _append(self, event: dict[str, Any]) -> None:
        with self.ledger_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")

    def log_event(self, **fields: Any) -> None:
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **fields,
        }
        self._append(event)
        if self.cloud_sync and self.api_key:
            try:
                import urllib.request

                req = urllib.request.Request(
                    f"{self.base_url}/ledger/events",
                    data=json.dumps({"events": [event]}).encode(),
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=5)
            except Exception:
                pass

    def mark_success(self, workflow_id: str, metadata: Optional[dict] = None) -> None:
        self.log_event(
            model="aurex-outcome",
            workflow_id=workflow_id,
            outcome="success",
            cost_type="outcome_signal",
            cost=0,
            input_tokens=0,
            output_tokens=0,
            extra_metadata=metadata or {},
        )

    def mark_failure(self, workflow_id: str, reason: str = "", metadata: Optional[dict] = None) -> None:
        meta = {"reason": reason, **(metadata or {})}
        self.log_event(
            model="aurex-outcome",
            workflow_id=workflow_id,
            outcome="failure",
            cost_type="outcome_signal",
            cost=0,
            input_tokens=0,
            output_tokens=0,
            extra_metadata=meta,
        )


def mark_success(workflow_id: str, metadata: Optional[dict] = None) -> None:
    AurexAuditor.get_instance().mark_success(workflow_id, metadata)


def mark_failure(workflow_id: str, reason: str = "", metadata: Optional[dict] = None) -> None:
    AurexAuditor.get_instance().mark_failure(workflow_id, reason, metadata)
