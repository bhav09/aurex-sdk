# Alembic migrations

DB schema is owned by Alembic going forward. `init_db()` (raw `create_all`) still
runs at startup for fresh dev databases and is idempotent — Alembic handles the
deltas for already-provisioned databases.

## Common commands

Run from `backend/`:

```bash
# apply all pending migrations
alembic upgrade head

# create a new revision after editing models
alembic revision --autogenerate -m "describe change"

# mark the current DB as up-to-date without running migrations
# (use this once on existing deployments before the first delta)
alembic stamp head
```

`DATABASE_URL` is read from `.env`. Async drivers (`postgresql+asyncpg`,
`sqlite+aiosqlite`) are auto-converted to their sync equivalents at migration
time.
