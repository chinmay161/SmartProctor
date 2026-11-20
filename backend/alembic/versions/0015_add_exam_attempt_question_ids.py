"""add exam_attempts.question_ids

Revision ID: 0015_add_exam_attempt_question_ids
Revises: 0014_add_question_created_by
Create Date: 2026-11-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_add_exam_attempt_question_ids"
down_revision = "0014_add_question_created_by"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exam_attempts", sa.Column("question_ids", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("exam_attempts", "question_ids")
