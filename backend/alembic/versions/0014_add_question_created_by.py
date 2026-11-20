"""add question created_by column and index

Revision ID: 0014_add_question_created_by
Revises: 0013_dashboard_indexes
Create Date: 2026-11-20 21:45:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0014_add_question_created_by"
down_revision: Union[str, Sequence[str], None] = "0013_dashboard_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "questions" in tables:
        columns = {col["name"] for col in inspector.get_columns("questions")}
        if "created_by" not in columns:
            if bind.dialect.name == "postgresql":
                op.execute("ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by VARCHAR")
            else:
                op.add_column("questions", sa.Column("created_by", sa.String(), nullable=True))

        existing_indices = {ix["name"] for ix in inspector.get_indexes("questions")}
        if "ix_questions_created_by" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("CREATE INDEX IF NOT EXISTS ix_questions_created_by ON questions (created_by)")
            else:
                op.create_index("ix_questions_created_by", "questions", ["created_by"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "questions" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("questions")}
        if "ix_questions_created_by" in existing_indices:
            op.drop_index("ix_questions_created_by", table_name="questions")

        columns = {col["name"] for col in inspector.get_columns("questions")}
        if "created_by" in columns:
            op.drop_column("questions", "created_by")
