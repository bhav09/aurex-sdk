"""
Migration 002 — Reliability / counterfactual fields on llm_events.

Idempotent. Adds projected_cost, recovery_provider, attempt_index if missing.
Run after migrate_001_extend_event_schema when present.
"""

from __future__ import annotations

from sqlalchemy import text

from src.database import engine

NEW_COLUMNS: list[tuple[str, str, bool, str | None]] = [
    ("projected_cost", "FLOAT", True, None),
    ("recovery_provider", "VARCHAR", True, None),
    ("attempt_index", "INTEGER", True, None),
]


def existing_columns(conn) -> set[str]:
    dialect = conn.engine.dialect.name
    if dialect == "sqlite":
        rows = conn.execute(text("PRAGMA table_info(llm_events)")).fetchall()
        return {r[1] for r in rows}
    rows = conn.execute(
        text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'llm_events'"
        )
    ).fetchall()
    return {r[0] for r in rows}


def run() -> None:
    with engine.begin() as conn:
        cols = existing_columns(conn)
        for name, sql_type, nullable, default in NEW_COLUMNS:
            if name in cols:
                continue
            null_sql = "" if nullable else " NOT NULL"
            default_sql = f" DEFAULT {default}" if default is not None else ""
            conn.execute(
                text(f"ALTER TABLE llm_events ADD COLUMN {name} {sql_type}{null_sql}{default_sql}")
            )
            print(f"Added column {name}")


if __name__ == "__main__":
    run()
