"""Extend llm_events columns, workflow_baselines, projects.slack_webhook_url."""

from alembic import op
import sqlalchemy as sa

revision = "20260530_02"
down_revision = "20260528_01"
branch_labels = None
depends_on = None

LLM_EVENT_COLS = [
    ("cached_tokens", sa.Integer(), "0"),
    ("cache_write_tokens", sa.Integer(), "0"),
    ("reasoning_tokens", sa.Integer(), "0"),
    ("is_batch", sa.Integer(), "0"),
    ("retry_count", sa.Integer(), "0"),
    ("loop_score", sa.Float(), None),
    ("team", sa.String(), None),
    ("tenant_id", sa.String(), None),
    ("outcome", sa.String(), "pending"),
    ("cost_type", sa.String(), "inference"),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "llm_events" in tables:
        existing = {c["name"] for c in inspector.get_columns("llm_events")}
        with op.batch_alter_table("llm_events") as batch:
            for name, col_type, default in LLM_EVENT_COLS:
                if name not in existing:
                    batch.add_column(sa.Column(name, col_type, nullable=True))
        for name, _, _ in LLM_EVENT_COLS:
            if name not in existing:
                try:
                    op.create_index(f"ix_llm_events_{name}", "llm_events", [name])
                except Exception:
                    pass

    if "projects" in tables:
        cols = {c["name"] for c in inspector.get_columns("projects")}
        if "slack_webhook_url" not in cols:
            with op.batch_alter_table("projects") as batch:
                batch.add_column(sa.Column("slack_webhook_url", sa.String(), nullable=True))

    if "workflow_baselines" not in tables:
        op.create_table(
            "workflow_baselines",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("workflow_id", sa.String(), nullable=False, index=True),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("avg_cost_per_success", sa.Float(), nullable=True),
            sa.Column("avg_retry_rate", sa.Float(), nullable=True),
            sa.Column("sample_size", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("window_start", sa.DateTime(), nullable=False),
            sa.Column("window_end", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index(
            "ix_workflow_baselines_project_workflow",
            "workflow_baselines",
            ["project_id", "workflow_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "workflow_baselines" in inspector.get_table_names():
        op.drop_table("workflow_baselines")
    if "projects" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("projects")}
        if "slack_webhook_url" in cols:
            with op.batch_alter_table("projects") as batch:
                batch.drop_column("slack_webhook_url")
