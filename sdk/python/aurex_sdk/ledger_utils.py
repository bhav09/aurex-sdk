"""Ledger path resolution and writable storage detection."""

from __future__ import annotations

import os
import sys
import tempfile
from typing import Optional, Tuple


def resolve_ledger_path(config_ledger_path: str, per_process: bool) -> str:
    """Resolve ledger path from env override and optional per-process suffix."""
    base = os.getenv("AUREX_LEDGER_PATH") or config_ledger_path
    if not per_process:
        return base

    worker = os.getenv("AUREX_WORKER_ID") or str(os.getpid())
    directory, filename = os.path.split(base)
    name, ext = os.path.splitext(filename)
    if not ext:
        ext = ".jsonl"
        name = filename or "ledger"
    elif not name:
        name = "ledger"
    return os.path.join(directory or ".aurex", f"{name}.{worker}{ext}")


def _probe_writable_directory(directory: str) -> bool:
    if not directory:
        directory = "."
    try:
        os.makedirs(directory, exist_ok=True)
        probe = os.path.join(directory, ".aurex_write_probe")
        with open(probe, "w", encoding="utf-8") as handle:
            handle.write("ok")
        os.remove(probe)
        return True
    except OSError:
        return False


def prepare_ledger_storage(
    ledger_path: str,
    storage_mode: str,
    per_process: bool,
) -> Tuple[str, str, Optional[str]]:
    """
    Ensure ledger storage is usable. Falls back to /tmp then memory-only mode.

    Returns (ledger_path, storage_mode, warning_message).
    """
    if storage_mode != "file":
        return ledger_path, storage_mode, None

    resolved = resolve_ledger_path(ledger_path, per_process)
    ledger_dir = os.path.dirname(resolved) or "."

    if _probe_writable_directory(ledger_dir):
        return resolved, "file", None

    tmp_dir = os.path.join(tempfile.gettempdir(), ".aurex")
    tmp_path = os.path.join(tmp_dir, os.path.basename(resolved))
    try:
        os.makedirs(tmp_dir, mode=0o700, exist_ok=True)
    except OSError:
        pass
    if _probe_writable_directory(tmp_dir):
        warning = (
            f"[Aurex Warning] Ledger directory not writable ({ledger_dir}); "
            f"using {tmp_path}"
        )
        return tmp_path, "file", warning

    warning = (
        "[Aurex Warning] No writable ledger path available; "
        "using memory-only storage (events will not persist locally)."
    )
    return resolved, "memory", warning


def emit_warning_once(message: str, flag_attr: str, owner: object) -> None:
    if getattr(owner, flag_attr, False):
        return
    print(message, file=sys.stderr)
    setattr(owner, flag_attr, True)
