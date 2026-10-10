"""add integrity_deduction column to violations

Revision ID: 0004_add_integrity_deduction
Revises: 0003_grading_flow
Create Date: 2026-03-01 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0004_add_integrity_deduction"
down_revision: Union[str, Sequence[str], None] = "0003_grading_flow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns("violations")]
    if "integrity_deduction" not in columns:
        with op.batch_alter_table("violations") as batch_op:
            batch_op.add_column(sa.Column("integrity_deduction", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns("violations")]
    if "integrity_deduction" in columns:
        with op.batch_alter_table("violations") as batch_op:
            batch_op.drop_column("integrity_deduction")
