"""grading flow and partial evaluation fields

Revision ID: 0003_grading_flow
Revises: 0002_exam_lifecycle
Create Date: 2026-02-25 21:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0003_grading_flow"
down_revision: Union[str, Sequence[str], None] = "0002_exam_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("exam_questions") as batch_op:
        batch_op.add_column(sa.Column("source_question_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("marks", sa.Integer(), nullable=False, server_default="1"))

    with op.batch_alter_table("exam_answers") as batch_op:
        batch_op.add_column(sa.Column("auto_score", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("manual_score", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("final_score", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("max_score", sa.Integer(), nullable=False, server_default="1"))
        batch_op.add_column(sa.Column("is_overridden", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.add_column(sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("exam_attempts") as batch_op:
        batch_op.add_column(sa.Column("auto_score_total", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("max_score_total", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("grading_version", sa.Integer(), nullable=False, server_default="0"))

    op.execute("UPDATE exam_questions SET marks = COALESCE(marks, 1)")
    op.execute("UPDATE exam_questions SET source_question_id = id WHERE source_question_id IS NULL")

    with op.batch_alter_table("exam_questions") as batch_op:
        batch_op.alter_column("source_question_id", existing_type=sa.String(), nullable=False)
        batch_op.create_index("ix_exam_questions_source_question_id", ["source_question_id"], unique=False)

    with op.batch_alter_table("exam_attempts") as batch_op:
        batch_op.drop_constraint("ck_exam_attempt_status", type_="check")
        batch_op.create_check_constraint(
            "ck_exam_attempt_status",
            "status IN ('IN_PROGRESS', 'SUBMITTED', 'PARTIALLY_EVALUATED', 'EVALUATED')",
        )


def downgrade() -> None:
    with op.batch_alter_table("exam_attempts") as batch_op:
        batch_op.drop_constraint("ck_exam_attempt_status", type_="check")
        batch_op.create_check_constraint(
            "ck_exam_attempt_status",
            "status IN ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED')",
        )
        batch_op.drop_column("grading_version")
        batch_op.drop_column("evaluated_at")
        batch_op.drop_column("max_score_total")
        batch_op.drop_column("auto_score_total")

    with op.batch_alter_table("exam_answers") as batch_op:
        batch_op.drop_column("graded_at")
        batch_op.drop_column("is_overridden")
        batch_op.drop_column("max_score")
        batch_op.drop_column("final_score")
        batch_op.drop_column("manual_score")
        batch_op.drop_column("auto_score")

    with op.batch_alter_table("exam_questions") as batch_op:
        batch_op.drop_index("ix_exam_questions_source_question_id")
        batch_op.drop_column("marks")
        batch_op.drop_column("source_question_id")
