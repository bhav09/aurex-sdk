"""Zero-code auto-instrumentation entry point.

Imported automatically when the user installs the hook (via `aurex
install-hook`, which writes `aurex.pth` into site-packages). The .pth
file contains `import aurex_sdk.hook`, so this module runs at interpreter
startup before any user code.

Activation requires both ``AUREX_ENABLED=1`` and ``AUREX_API_KEY=...``.
Failures are swallowed so a misconfigured environment can never break
the host application.
"""

from __future__ import annotations

import os
import sys


def _activate() -> None:
    if os.environ.get("AUREX_ENABLED") != "1":
        return
    api_key = os.environ.get("AUREX_API_KEY")
    if not api_key:
        return
    try:
        from aurex_sdk import AurexAuditor, AurexConfig

        auditor = AurexAuditor(
            AurexConfig(
                api_key=api_key,
                project=os.environ.get("AUREX_WORKFLOW_ID", "default"),
                cloud_sync=True,
                local_only=False,
                base_url=os.environ.get("AUREX_BASE_URL"),
            )
        )
        auditor.patch_all()
        if os.environ.get("AUREX_DEBUG") == "1":
            print(f"[aurex] auto-instrumentation active (endpoint={auditor.config.cloud_endpoint})", file=sys.stderr)
    except Exception as e:
        if os.environ.get("AUREX_DEBUG") == "1":
            print(f"[aurex] hook init failed: {e}", file=sys.stderr)


_activate()
