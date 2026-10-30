"""admin stats indexes

Revision ID: 0012_admin_stats_indexes
Revises: 0011_add_exam_digest_sent_at
Create Date: 2026-10-30 16:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0012_admin_stats_indexes"
down_revision: Union[str, Sequence[str], None] = "0011_add_exam_digest_sent_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # 1. violations: (timestamp, review_status)
    if "violations" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("violations")}
        if "ix_violations_timestamp_review_status" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_violations_timestamp_review_status "
                    "ON violations (timestamp, review_status)"
                )
            else:
                op.create_index(
                    "ix_violations_timestamp_review_status",
                    "violations",
                    ["timestamp", "review_status"],
                    unique=False,
                )

    # 2. exam_sessions: (status, last_heartbeat)
    if "exam_sessions" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exam_sessions")}
        if "ix_exam_sessions_status_last_heartbeat" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_exam_sessions_status_last_heartbeat "
                    "ON exam_sessions (status, last_heartbeat)"
                )
            else:
                op.create_index(
                    "ix_exam_sessions_status_last_heartbeat",
                    "exam_sessions",
                    ["status", "last_heartbeat"],
                    unique=False,
                )

    # 3. user_profiles: (role)
    if "user_profiles" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("user_profiles")}
        if "ix_user_profiles_role" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_user_profiles_role "
                    "ON user_profiles (role)"
                )
            else:
                op.create_index(
                    "ix_user_profiles_role",
                    "user_profiles",
                    ["role"],
                    unique=False,
                )

    # 4. exams: (status, start_time, end_time)
    if "exams" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exams")}
        if "ix_exams_status_time_window" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_exams_status_time_window "
                    "ON exams (status, start_time, end_time)"
                )
            else:
                op.create_index(
                    "ix_exams_status_time_window",
                    "exams",
                    ["status", "start_time", "end_time"],
                    unique=False,
                )

    # 5. role_audit_logs: (timestamp)
    if "role_audit_logs" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("role_audit_logs")}
        if "ix_role_audit_logs_timestamp" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_role_audit_logs_timestamp "
                    "ON role_audit_logs (timestamp)"
                )
            else:
                op.create_index(
                    "ix_role_audit_logs_timestamp",
                    "role_audit_logs",
                    ["timestamp"],
                    unique=False,
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "violations" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("violations")}
        if "ix_violations_timestamp_review_status" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_violations_timestamp_review_status")
            else:
                op.drop_index("ix_violations_timestamp_review_status", table_name="violations")

    if "exam_sessions" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exam_sessions")}
        if "ix_exam_sessions_status_last_heartbeat" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_exam_sessions_status_last_heartbeat")
            else:
                op.drop_index("ix_exam_sessions_status_last_heartbeat", table_name="exam_sessions")

    if "user_profiles" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("user_profiles")}
        if "ix_user_profiles_role" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_user_profiles_role")
            else:
                op.drop_index("ix_user_profiles_role", table_name="user_profiles")

    if "exams" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exams")}
        if "ix_exams_status_time_window" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_exams_status_time_window")
            else:
                op.drop_index("ix_exams_status_time_window", table_name="exams")

    if "role_audit_logs" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("role_audit_logs")}
        if "ix_role_audit_logs_timestamp" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_role_audit_logs_timestamp")
            else:
                op.drop_index("ix_role_audit_logs_timestamp", table_name="role_audit_logs")
