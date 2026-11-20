"""dashboard indexes

Revision ID: 0013_dashboard_indexes
Revises: 0012_admin_stats_indexes
Create Date: 2026-11-20 13:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0013_dashboard_indexes"
down_revision: Union[str, Sequence[str], None] = "0012_admin_stats_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # 1. violations (attempt_id)
    if "violations" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("violations")}
        if "ix_violations_attempt_id" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_violations_attempt_id "
                    "ON violations (attempt_id)"
                )
            else:
                op.create_index(
                    "ix_violations_attempt_id",
                    "violations",
                    ["attempt_id"],
                    unique=False,
                )

    # 2. exam_sessions (exam_id)
    if "exam_sessions" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exam_sessions")}
        if "ix_exam_sessions_exam_id" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_exam_sessions_exam_id "
                    "ON exam_sessions (exam_id)"
                )
            else:
                op.create_index(
                    "ix_exam_sessions_exam_id",
                    "exam_sessions",
                    ["exam_id"],
                    unique=False,
                )

    # 3. exam_attempts (exam_id, status) -- compound
    if "exam_attempts" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exam_attempts")}
        if "ix_exam_attempts_exam_id_status" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_exam_attempts_exam_id_status "
                    "ON exam_attempts (exam_id, status)"
                )
            else:
                op.create_index(
                    "ix_exam_attempts_exam_id_status",
                    "exam_attempts",
                    ["exam_id", "status"],
                    unique=False,
                )

    # 4. proctor_assignments table and index (teacher_id)
    if "proctor_assignments" not in tables:
        op.create_table(
            "proctor_assignments",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("exam_id", sa.String(), nullable=False),
            sa.Column("teacher_id", sa.String(), nullable=False),
        )
        existing_indices = set()
    else:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("proctor_assignments")}

    if "ix_proctor_assignments_teacher_id" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_proctor_assignments_teacher_id "
                    "ON proctor_assignments (teacher_id)"
                )
            else:
                op.create_index(
                    "ix_proctor_assignments_teacher_id",
                    "proctor_assignments",
                    ["teacher_id"],
                    unique=False,
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "violations" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("violations")}
        if "ix_violations_attempt_id" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_violations_attempt_id")
            else:
                op.drop_index("ix_violations_attempt_id", table_name="violations")

    if "exam_sessions" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exam_sessions")}
        if "ix_exam_sessions_exam_id" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_exam_sessions_exam_id")
            else:
                op.drop_index("ix_exam_sessions_exam_id", table_name="exam_sessions")

    if "exam_attempts" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("exam_attempts")}
        if "ix_exam_attempts_exam_id_status" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_exam_attempts_exam_id_status")
            else:
                op.drop_index("ix_exam_attempts_exam_id_status", table_name="exam_attempts")

    if "proctor_assignments" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("proctor_assignments")}
        if "ix_proctor_assignments_teacher_id" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_proctor_assignments_teacher_id")
            else:
                op.drop_index("ix_proctor_assignments_teacher_id", table_name="proctor_assignments")
