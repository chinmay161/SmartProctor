"""add review labels to violations and create problem_reports table

Revision ID: 0007_add_review_labels_and_problem_reports
Revises: 0006_add_session_events
Create Date: 2026-10-25 17:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007_add_review_labels_and_problem_reports"
down_revision: Union[str, Sequence[str], None] = "0006_add_session_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # 1. Add review columns to violations if not present
    if "violations" in tables:
        violation_cols = {c["name"] for c in inspector.get_columns("violations")}
        if "review_status" not in violation_cols:
            op.add_column("violations", sa.Column("review_status", sa.String(length=32), nullable=False, server_default="NONE"))
        if "reviewed_by" not in violation_cols:
            op.add_column("violations", sa.Column("reviewed_by", sa.String(length=128), nullable=True))
        if "reviewed_at" not in violation_cols:
            op.add_column("violations", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        if "review_note" not in violation_cols:
            op.add_column("violations", sa.Column("review_note", sa.String(length=300), nullable=True))

    # 2. Create problem_reports table if not present
    if "problem_reports" not in tables:
        op.create_table(
            "problem_reports",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("student_id", sa.String(length=128), nullable=False),
            sa.Column("trace_id", sa.String(length=64), nullable=True),
            sa.Column("session_id", sa.String(length=36), nullable=True),
            sa.Column("exam_id", sa.String(length=36), nullable=True),
            sa.Column("category", sa.String(length=32), nullable=False),
            sa.Column("text", sa.String(length=500), nullable=False),
            sa.Column("page_path", sa.String(length=255), nullable=False),
            sa.Column("app_version", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("status", sa.String(length=16), server_default="OPEN", nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_problem_reports_status", "problem_reports", ["status"], unique=False)
        op.create_index("ix_problem_reports_created_at", "problem_reports", ["created_at"], unique=False)
        op.create_index("ix_problem_reports_trace_id", "problem_reports", ["trace_id"], unique=False)
        op.create_index("ix_problem_reports_session_id", "problem_reports", ["session_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "problem_reports" in tables:
        op.drop_index("ix_problem_reports_session_id", table_name="problem_reports")
        op.drop_index("ix_problem_reports_trace_id", table_name="problem_reports")
        op.drop_index("ix_problem_reports_created_at", table_name="problem_reports")
        op.drop_index("ix_problem_reports_status", table_name="problem_reports")
        op.drop_table("problem_reports")

    if "violations" in tables:
        violation_cols = {c["name"] for c in inspector.get_columns("violations")}
        if "review_note" in violation_cols:
            op.drop_column("violations", "review_note")
        if "reviewed_at" in violation_cols:
            op.drop_column("violations", "reviewed_at")
        if "reviewed_by" in violation_cols:
            op.drop_column("violations", "reviewed_by")
        if "review_status" in violation_cols:
            op.drop_column("violations", "review_status")
