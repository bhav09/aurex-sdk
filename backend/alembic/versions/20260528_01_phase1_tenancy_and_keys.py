"""phase1: tenancy + project-scoped api keys

Adds users, organizations, projects, memberships, key_audit_log;
extends api_keys with Argon2id + project scope; adds llm_events.project_id.

Revision ID: 20260528_01
Revises:
Create Date: 2026-05-28
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260528_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ------------------------------------------------------------------
    # New tables
    # ------------------------------------------------------------------
    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("email", name="uq_users_email"),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    if "organizations" not in existing_tables:
        op.create_table(
            "organizations",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    if "projects" not in existing_tables:
        op.create_table(
            "projects",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("org_id", sa.String(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("environment", sa.String(), nullable=False, server_default="dev"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("org_id", "name", "environment", name="uq_project_org_name_env"),
        )
        op.create_index("ix_projects_org_id", "projects", ["org_id"])

    if "memberships" not in existing_tables:
        op.create_table(
            "memberships",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("org_id", sa.String(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(), nullable=False, server_default="owner"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", "org_id", name="uq_membership_user_org"),
        )
        op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
        op.create_index("ix_memberships_org_id", "memberships", ["org_id"])

    if "key_audit_log" not in existing_tables:
        op.create_table(
            "key_audit_log",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("key_id", sa.String(), sa.ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("actor_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("actor_email", sa.String(), nullable=True),
            sa.Column("ip", sa.String(), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_key_audit_log_key_id", "key_audit_log", ["key_id"])
        op.create_index("ix_key_audit_log_event_type", "key_audit_log", ["event_type"])
        op.create_index("ix_key_audit_log_at", "key_audit_log", ["at"])

    # ------------------------------------------------------------------
    # Extend api_keys
    # ------------------------------------------------------------------
    if "api_keys" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("api_keys")}
        with op.batch_alter_table("api_keys") as batch:
            if "last4" not in existing_cols:
                batch.add_column(sa.Column("last4", sa.String(length=4), nullable=True))
            if "argon2_hash" not in existing_cols:
                batch.add_column(sa.Column("argon2_hash", sa.String(), nullable=True))
            if "salt" not in existing_cols:
                batch.add_column(sa.Column("salt", sa.String(), nullable=True))
            if "project_id" not in existing_cols:
                batch.add_column(sa.Column("project_id", sa.String(), nullable=True))
            if "environment" not in existing_cols:
                batch.add_column(sa.Column("environment", sa.String(), nullable=True))
            if "scopes" not in existing_cols:
                batch.add_column(sa.Column("scopes", sa.JSON(), nullable=True))
            if "created_by" not in existing_cols:
                batch.add_column(sa.Column("created_by", sa.String(), nullable=True))
            if "revoked_at" not in existing_cols:
                batch.add_column(sa.Column("revoked_at", sa.DateTime(), nullable=True))
            if "rotation_grace_until" not in existing_cols:
                batch.add_column(sa.Column("rotation_grace_until", sa.DateTime(), nullable=True))
            if "key_hash" in existing_cols:
                batch.alter_column("key_hash", existing_type=sa.String(), nullable=True)

        existing_indexes = {i["name"] for i in inspector.get_indexes("api_keys")}
        if "ix_api_keys_prefix" not in existing_indexes:
            op.create_index("ix_api_keys_prefix", "api_keys", ["prefix"])
        if "ix_api_keys_project_id" not in existing_indexes:
            op.create_index("ix_api_keys_project_id", "api_keys", ["project_id"])

    # ------------------------------------------------------------------
    # Extend llm_events with project_id
    # ------------------------------------------------------------------
    if "llm_events" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("llm_events")}
        if "project_id" not in existing_cols:
            with op.batch_alter_table("llm_events") as batch:
                batch.add_column(sa.Column("project_id", sa.String(), nullable=True))
            op.create_index("ix_llm_events_project_id", "llm_events", ["project_id"])


def downgrade() -> None:
    # Drop new columns and tables. Best-effort; tolerant of missing objects so
    # `alembic downgrade base` is safe on partially-migrated databases.
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "llm_events" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("llm_events")}
        if "project_id" in cols:
            try:
                op.drop_index("ix_llm_events_project_id", table_name="llm_events")
            except Exception:
                pass
            with op.batch_alter_table("llm_events") as batch:
                batch.drop_column("project_id")

    if "api_keys" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("api_keys")}
        for idx in ("ix_api_keys_project_id", "ix_api_keys_prefix"):
            try:
                op.drop_index(idx, table_name="api_keys")
            except Exception:
                pass
        with op.batch_alter_table("api_keys") as batch:
            for col in (
                "rotation_grace_until",
                "revoked_at",
                "created_by",
                "scopes",
                "environment",
                "project_id",
                "salt",
                "argon2_hash",
                "last4",
            ):
                if col in cols:
                    batch.drop_column(col)

    for t in ("key_audit_log", "memberships", "projects", "organizations", "users"):
        if t in inspector.get_table_names():
            op.drop_table(t)
