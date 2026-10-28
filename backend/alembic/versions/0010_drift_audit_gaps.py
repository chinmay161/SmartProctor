"""drift audit gaps: add integrity_score to exam_attempts and create snapshots table if not exists

Revision ID: 0010_drift_audit_gaps
Revises: 0009_add_evidence_status
Create Date: 2026-10-28 21:35:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0010_drift_audit_gaps"
down_revision: Union[str, Sequence[str], None] = "0009_add_evidence_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # 1. Add integrity_score to exam_attempts if missing
    if "exam_attempts" in tables:
        if bind.dialect.name == "postgresql":
            op.execute("ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS integrity_score INTEGER NOT NULL DEFAULT 100")
        else:
            columns = {c["name"] for c in inspector.get_columns("exam_attempts")}
            if "integrity_score" not in columns:
                with op.batch_alter_table("exam_attempts") as batch_op:
                    batch_op.add_column(sa.Column("integrity_score", sa.Integer(), nullable=False, server_default="100"))

    # 2. Create snapshots table if missing
    if "snapshots" not in tables:
        op.create_table(
            "snapshots",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("session_id", sa.String(), nullable=False),
            sa.Column("student_id", sa.String(), nullable=False),
            sa.Column("file_path", sa.String(), nullable=False),
            sa.Column("reason", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "snapshots" in tables:
        op.drop_table("snapshots")

    if "exam_attempts" in tables:
        if bind.dialect.name == "postgresql":
            op.execute("ALTER TABLE exam_attempts DROP COLUMN IF EXISTS integrity_score")
        else:
            columns = {c["name"] for c in inspector.get_columns("exam_attempts")}
            if "integrity_score" in columns:
                with op.batch_alter_table("exam_attempts") as batch_op:
                    batch_op.drop_column("integrity_score")
