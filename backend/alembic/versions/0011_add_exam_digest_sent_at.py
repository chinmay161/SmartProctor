"""add digest_sent_at to exams

Revision ID: 0011_add_exam_digest_sent_at
Revises: 0010_drift_audit_gaps
Create Date: 2026-10-30 14:10:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0011_add_exam_digest_sent_at"
down_revision: Union[str, Sequence[str], None] = "0010_drift_audit_gaps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "exams" in tables:
        if bind.dialect.name == "postgresql":
            op.execute("ALTER TABLE exams ADD COLUMN IF NOT EXISTS digest_sent_at TIMESTAMP WITH TIME ZONE")
        else:
            columns = {c["name"] for c in inspector.get_columns("exams")}
            if "digest_sent_at" not in columns:
                with op.batch_alter_table("exams") as batch_op:
                    batch_op.add_column(sa.Column("digest_sent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "exams" in tables:
        columns = {c["name"] for c in inspector.get_columns("exams")}
        if "digest_sent_at" in columns:
            with op.batch_alter_table("exams") as batch_op:
                batch_op.drop_column("digest_sent_at")
