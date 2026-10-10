"""drop custom JWT session tables (auth is Auth0-only)

Revision ID: 0005_drop_custom_session_tables
Revises: 0004_add_integrity_deduction
Create Date: 2026-10-10 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0005_drop_custom_session_tables"
down_revision: Union[str, Sequence[str], None] = "0004_add_integrity_deduction"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# These tables were created by Base.metadata.create_all (never by a migration),
# so they may or may not exist depending on how the database was provisioned.
SESSION_TABLES = ("user_sessions", "session_revocation_list", "session_audit_logs")


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())
    for table in SESSION_TABLES:
        if table in existing:
            op.drop_table(table)


def downgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    if "user_sessions" not in existing:
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("access_token", sa.String(), nullable=False, unique=True),
            sa.Column("refresh_token", sa.String(), nullable=False, unique=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("refresh_token_expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ip_address", sa.String(), nullable=True),
            sa.Column("user_agent", sa.String(), nullable=True),
            sa.Column("device_fingerprint", sa.String(), nullable=True),
            sa.Column("is_mobile", sa.Boolean(), nullable=True),
            sa.Column("is_trusted_device", sa.Boolean(), nullable=True),
            sa.Column("refresh_count", sa.Integer(), nullable=True),
            sa.Column("max_refresh_count", sa.Integer(), nullable=True),
            sa.Column("mfa_verified", sa.Boolean(), nullable=True),
            sa.Column("login_location", sa.String(), nullable=True),
            sa.Column("session_metadata", sa.JSON(), nullable=True),
        )
        op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    if "session_revocation_list" not in existing:
        op.create_table(
            "session_revocation_list",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("token", sa.String(), nullable=False),
            sa.Column("token_type", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("reason", sa.String(), nullable=True),
        )
        op.create_index("ix_session_revocation_list_token", "session_revocation_list", ["token"], unique=True)
        op.create_index("ix_session_revocation_list_user_id", "session_revocation_list", ["user_id"])

    if "session_audit_logs" not in existing:
        op.create_table(
            "session_audit_logs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("session_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("ip_address", sa.String(), nullable=True),
            sa.Column("user_agent", sa.String(), nullable=True),
            sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("error_message", sa.String(), nullable=True),
        )
        op.create_index("ix_session_audit_logs_session_id", "session_audit_logs", ["session_id"])
        op.create_index("ix_session_audit_logs_user_id", "session_audit_logs", ["user_id"])
