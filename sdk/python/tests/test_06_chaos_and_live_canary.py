"""Chaos resilience tests (Redis drop, 500 sync retry, pending/overflow crash recovery, read-only FS) & opt-in live cloud canary."""

from __future__ import annotations

import json
import os
import stat
import time

import openai
import pytest

from aurex_sdk import AurexAuditor, AurexConfig
from aurex_sdk.state_store import RedisStateStore


def test_unreachable_redis_fails_open_under_subsecond_timeout(wire_server):
    # Port 1 on loopback refuses connections immediately; RedisStateStore MUST fail open to InMemoryStateStore
    store = RedisStateStore(redis_url="redis://127.0.0.1:1/0")
    t0 = time.perf_counter()
    store.add_spend("wf-redis-down", 0.25)
    summary = store.get_spend_summary("wf-redis-down")
    elapsed = time.perf_counter() - t0

    assert elapsed < 1.5
    assert summary["session_cost"] == pytest.approx(0.25)

    auditor = AurexAuditor(
        AurexConfig(storage_mode="memory", local_only=True, redis_url="redis://127.0.0.1:1/0")
    )
    auditor.patch_openai()
    client = openai.OpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1")
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Must succeed even when Redis is down"}],
    )
    assert resp.choices[0].message.content == "OpenAI wire OK"


def test_cloud_sync_retry_recovery_on_transient_500(wire_server):
    # First POST /ledger/events returns 500, second returns 200 -> sync_batch_with_retry recovers!
    wire_server.enqueue({"status": 500, "error_message": "Temporary DB maintenance"})
    wire_server.enqueue({"status": 200, "json": {"accepted": 1, "rejected": 0}})

    auditor = AurexAuditor(
        AurexConfig(
            api_key="aux_live_retry_test_key_123456",
            base_url=wire_server.base_url,
            cloud_sync=True,
            local_only=False,
            storage_mode="memory",
            sync_max_retries=2,
            sync_timeout_seconds=2.0,
        )
    )
    auditor.log_event(model="gpt-4o-mini", input_tokens=100, output_tokens=20, workflow_id="wf-sync-retry")
    assert auditor.flush_async() is True
    assert len(wire_server.requests) == 2
    assert auditor.get_health()["sync_error_count"] == 0


def test_pending_jsonl_crash_recovery_and_queue_overflow_spill(tmp_path):
    ledger_dir = tmp_path / "aurex_crash_test"
    ledger_dir.mkdir(parents=True)
    pending_file = ledger_dir / "pending.jsonl"
    ledger_file = ledger_dir / "ledger.jsonl"

    crashed_event = {
        "timestamp": "2026-11-18T10:00:00Z",
        "provider": "openai",
        "model": "gpt-4o",
        "input_tokens": 500,
        "output_tokens": 100,
        "cost": 0.00225,
        "workflow_id": "wf-recovered-after-sigterm",
    }
    pending_file.write_text(json.dumps(crashed_event) + "\n", encoding="utf-8")

    # Initializing AurexAuditor recovers pending.jsonl -> appends to ledger -> removes pending.jsonl
    auditor = AurexAuditor(
        AurexConfig(
            ledger_path=str(ledger_file),
            storage_mode="file",
            per_process_ledger=False,
            local_only=True,
            max_queue_size=2,
            flush_interval_seconds=60.0,
        )
    )
    assert not pending_file.exists()
    recovered_lines = [json.loads(x) for x in ledger_file.read_text(encoding="utf-8").splitlines() if x.strip()]
    assert any(r["workflow_id"] == "wf-recovered-after-sigterm" for r in recovered_lines)

    # Overflow queue (max_queue_size=2) with 6 rapid events -> shuts down cleanly flushing worker batch + overflow file!
    for idx in range(6):
        auditor.log_event(model="gpt-4o-mini", input_tokens=10, output_tokens=5, workflow_id=f"wf-q-{idx}")

    overflow_file = ledger_dir / "queue_overflow.jsonl"
    pending_after = ledger_dir / "pending.jsonl"
    auditor.shutdown()
    total_persisted = len([x for x in ledger_file.read_text(encoding="utf-8").splitlines() if x.strip()])
    if overflow_file.exists():
        total_persisted += len([x for x in overflow_file.read_text(encoding="utf-8").splitlines() if x.strip()])
    if pending_after.exists():
        total_persisted += len([x for x in pending_after.read_text(encoding="utf-8").splitlines() if x.strip()])
    assert total_persisted >= 7


def test_readonly_filesystem_falls_back_gracefully_without_crashing(tmp_path):
    ro_dir = tmp_path / "readonly_container_fs"
    ro_dir.mkdir()
    ro_dir.chmod(stat.S_IREAD | stat.S_IXUSR)
    try:
        auditor = AurexAuditor(
            AurexConfig(
                ledger_path=str(ro_dir / "subdir" / "ledger.jsonl"),
                storage_mode="file",
                local_only=True,
            )
        )
        # Either redirects to writable /tmp/.aurex or falls back to memory mode — never crashes!
        assert auditor.config.storage_mode in ("file", "memory")
        assert str(ro_dir) not in auditor.config.ledger_path or auditor.config.storage_mode == "memory"
        auditor.log_event(model="gpt-4o-mini", input_tokens=50, output_tokens=10, workflow_id="wf-ro")
        auditor.flush()
        assert auditor.get_health()["events_logged"] >= 1
    finally:
        ro_dir.chmod(stat.S_IRWXU)


def _has_real_key(env_name: str) -> bool:
    val = (os.getenv(env_name) or "").strip()
    return bool(val) and not val.lower().startswith("your_") and not val.endswith("...")


@pytest.mark.skipif(
    os.getenv("AUREX_RUN_LIVE_TESTS") != "1",
    reason="Set AUREX_RUN_LIVE_TESTS=1 with real provider API keys to run live cloud canary tests.",
)
def test_live_cloud_providers_canary():
    """Opt-in live cloud smoke canary (~$0.01 total across configured providers)."""
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
    auditor.patch_all()
    ran_any = False

    if _has_real_key("OPENAI_API_KEY"):
        oa = openai.OpenAI()
        r = oa.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "developer", "content": "Reply in 3 words."}, {"role": "user", "content": "Ping"}],
            max_completion_tokens=16,
            workflow_id="live-openai-canary",
        )
        assert r.choices[0].message.content
        ran_any = True

    if _has_real_key("ANTHROPIC_API_KEY"):
        import anthropic

        ant = anthropic.Anthropic()
        m = ant.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=16,
            messages=[{"role": "user", "content": "Reply with OK"}],
            workflow_id="live-anthropic-canary",
        )
        assert m.content
        ran_any = True

    if _has_real_key("GEMINI_API_KEY"):
        from google import genai

        gc = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        gr = gc.models.generate_content(model="gemini-2.5-flash", contents="Reply OK", workflow_id="live-gemini-canary")
        assert gr.text
        ran_any = True

    if _has_real_key("GROQ_API_KEY"):
        groq_oa = openai.OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")
        grq = groq_oa.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "Reply OK"}],
            max_tokens=16,
            workflow_id="live-groq-canary",
        )
        assert grq.choices[0].message.content
        ran_any = True

    assert ran_any, "AUREX_RUN_LIVE_TESTS=1 was set, but no provider API keys were found in environment."
    auditor.flush()
    assert len(auditor.get_local_events()) >= 1
