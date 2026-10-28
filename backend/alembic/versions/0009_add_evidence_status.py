"""add evidence_status column to violations

Revision ID: 0009_add_evidence_status
Revises: 0008_student_events_index
Create Date: 2026-10-28 21:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0009_add_evidence_status"
down_revision: Union[str, Sequence[str], None] = "0008_student_events_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "violations" in tables:
        if bind.dialect.name == "postgresql":
            op.execute("ALTER TABLE violations ADD COLUMN IF NOT EXISTS evidence_status VARCHAR(32)")
        else:
            columns = {c["name"] for c in inspector.get_columns("violations")}
            if "evidence_status" not in columns:
                with op.batch_alter_table("violations") as batch_op:
                    batch_op.add_column(sa.Column("evidence_status", sa.String(length=32), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "violations" in tables:
        if bind.dialect.name == "postgresql":
            op.execute("ALTER TABLE violations DROP COLUMN IF EXISTS evidence_status")
        else:
            columns = {c["name"] for c in inspector.get_columns("violations")}
            if "evidence_status" in columns:
                with op.batch_alter_table("violations") as batch_op:
                    batch_op.drop_column("evidence_status")
