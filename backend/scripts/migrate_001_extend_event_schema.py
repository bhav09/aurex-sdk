"""
Migration 001 — Extend llm_events with May-2026 provider fields.

Idempotent. Safe to re-run. Works on the existing SQLite database that
backend/src/database.py provisions via `Base.metadata.create_all`. For Postgres
deployments, the same SQL is portable except for the introspection step.

What it does:
  1. Adds the new columns from llm_event.py (cached_input_tokens, reasoning_tokens,
     api_key_id, service_tier, status, latency_ms, reported_cost_usd, etc.)
     using ALTER TABLE ADD COLUMN (idempotent via column-existence check).
  2. Backfills cached_input_tokens and cache_creation_5m_tokens from any rows
     whose extra_metadata JSON has the legacy `cache_read_tokens` /
     `cache_creation_tokens` keys (written by the old csv_ingestion.py:80-84).
  3. Sets cost_source = 'estimate' on all existing rows (since old ingest path
     never recorded provider-billed costs).

Usage:
    cd backend
    python -m scripts.migrate_001_extend_event_schema
"""

from __future__ import annotations

import json
import sys
from typing import Iterable

from sqlalchemy import text

from src.database import engine


# (column_name, SQL type, nullable, default-literal-or-None)
NEW_COLUMNS: list[tuple[str, str, bool, str | None]] = [
    ("cached_input_tokens",       "INTEGER", True,  "0"),
    ("cache_creation_5m_tokens",  "INTEGER", True,  "0"),
    ("cache_creation_1h_tokens",  "INTEGER", True,  "0"),
    ("reasoning_tokens",          "INTEGER", True,  "0"),
    ("audio_input_tokens",        "INTEGER", True,  "0"),
    ("audio_output_tokens",       "INTEGER", True,  "0"),
    ("video_input_tokens",        "INTEGER", True,  "0"),
    ("tool_use_prompt_tokens",    "INTEGER", True,  "0"),
    ("modality_breakdown",        "JSON",    True,  None),
    ("num_requests",              "INTEGER", False, "1"),
    ("bucket_end",                "DATETIME",True,  None),
    ("api_key_id",                "VARCHAR", True,  None),
    ("project_id",                "VARCHAR", True,  None),
    ("workspace_id",              "VARCHAR", True,  None),
    ("end_user_id",               "VARCHAR", True,  None),
    ("region",                    "VARCHAR", True,  None),
    ("service_tier",              "VARCHAR", True,  None),
    ("context_window_tier",       "VARCHAR", True,  None),
    ("speed_tier",                "VARCHAR", True,  None),
    ("status",                    "VARCHAR", True,  None),
    ("error_code",                "VARCHAR", True,  None),
    ("latency_ms",                "INTEGER", True,  None),
    ("finish_reason",             "VARCHAR", True,  None),
    ("reported_cost_usd",         "FLOAT",   True,  None),
    ("list_cost_usd",             "FLOAT",   True,  None),
    ("cost_source",               "VARCHAR", True,  "'estimate'"),
    ("server_tool_use",           "JSON",    True,  None),
    ("source_adapter",            "VARCHAR", True,  None),
]

NEW_INDEXES: list[tuple[str, str]] = [
    ("ix_llm_events_api_key_id",   "api_key_id"),
    ("ix_llm_events_project_id",   "project_id"),
    ("ix_llm_events_workspace_id", "workspace_id"),
    ("ix_llm_events_end_user_id",  "end_user_id"),
    ("ix_llm_events_source_adapter", "source_adapter"),
]


def existing_columns(conn) -> set[str]:
    """SQLite-friendly column introspection. Falls back to information_schema for Postgres."""
    dialect = conn.engine.dialect.name
    if dialect == "sqlite":
        rows = conn.execute(text("PRAGMA table_info(llm_events)")).fetchall()
        return {r[1] for r in rows}
    rows = conn.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'llm_events'"
    )).fetchall()
    return {r[0] for r in rows}


def existing_indexes(conn) -> set[str]:
    dialect = conn.engine.dialect.name
    if dialect == "sqlite":
        rows = conn.execute(text("PRAGMA index_list(llm_events)")).fetchall()
        return {r[1] for r in rows}
    rows = conn.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'llm_events'"
    )).fetchall()
    return {r[0] for r in rows}


def add_columns(conn) -> int:
    have = existing_columns(conn)
    added = 0
    for name, sqltype, nullable, default in NEW_COLUMNS:
        if name in have:
            continue
        nn = "" if nullable else " NOT NULL"
        df = f" DEFAULT {default}" if default is not None else ""
        conn.execute(text(f"ALTER TABLE llm_events ADD COLUMN {name} {sqltype}{nn}{df}"))
        added += 1
        print(f"  + added column {name} {sqltype}{df}")
    return added


def add_indexes(conn) -> int:
    have = existing_indexes(conn)
    added = 0
    for idx_name, col in NEW_INDEXES:
        if idx_name in have:
            continue
        conn.execute(text(f"CREATE INDEX {idx_name} ON llm_events ({col})"))
        added += 1
        print(f"  + created index {idx_name} on ({col})")
    return added


def backfill_cache_tokens(conn) -> int:
    """
    Old ingest path stored cache_creation_input_tokens / cache_read_input_tokens
    in extra_metadata as cache_creation_tokens / cache_read_tokens. Hoist them
    into typed columns. Skip rows already populated.
    """
    rows: Iterable = conn.execute(text(
        "SELECT id, extra_metadata FROM llm_events "
        "WHERE extra_metadata IS NOT NULL "
        "  AND (cached_input_tokens IS NULL OR cached_input_tokens = 0) "
        "  AND (cache_creation_5m_tokens IS NULL OR cache_creation_5m_tokens = 0)"
    )).fetchall()

    updated = 0
    for row_id, meta_raw in rows:
        if meta_raw is None:
            continue
        meta = meta_raw if isinstance(meta_raw, dict) else json.loads(meta_raw)
        cache_read = int(meta.get("cache_read_tokens") or 0)
        cache_create = int(meta.get("cache_creation_tokens") or 0)
        if cache_read == 0 and cache_create == 0:
            continue
        conn.execute(
            text(
                "UPDATE llm_events "
                "SET cached_input_tokens = :r, cache_creation_5m_tokens = :c "
                "WHERE id = :id"
            ),
            {"r": cache_read, "c": cache_create, "id": row_id},
        )
        updated += 1
    if updated:
        print(f"  ↻ backfilled cache tokens on {updated} rows")
    return updated


def set_cost_source_default(conn) -> int:
    res = conn.execute(text(
        "UPDATE llm_events SET cost_source = 'estimate' "
        "WHERE cost_source IS NULL"
    ))
    n = res.rowcount or 0
    if n:
        print(f"  ↻ set cost_source='estimate' on {n} rows")
    return n


def set_num_requests_default(conn) -> int:
    res = conn.execute(text(
        "UPDATE llm_events SET num_requests = 1 "
        "WHERE num_requests IS NULL OR num_requests = 0"
    ))
    n = res.rowcount or 0
    if n:
        print(f"  ↻ set num_requests=1 on {n} rows")
    return n


def main() -> int:
    print(f"Migrating {engine.url} ...")
    with engine.begin() as conn:
        # If the table doesn't exist yet, fall through to create_all in init_db.
        try:
            conn.execute(text("SELECT 1 FROM llm_events LIMIT 1"))
        except Exception:
            print("  llm_events table does not exist — run init_db() first")
            return 1

        added_cols = add_columns(conn)
        added_idx = add_indexes(conn)
        backfilled = backfill_cache_tokens(conn)
        cost_src = set_cost_source_default(conn)
        nr = set_num_requests_default(conn)

    print(
        f"Done. cols+={added_cols} idx+={added_idx} "
        f"backfilled={backfilled} cost_source_set={cost_src} num_requests_set={nr}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
