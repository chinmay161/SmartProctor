"""exam lifecycle tables and constraints

Revision ID: 0002_exam_lifecycle
Revises: 0001_baseline_schema
Create Date: 2026-02-19 00:05:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_exam_lifecycle"
down_revision: Union[str, Sequence[str], None] = "0001_baseline_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("exams") as batch_op:
        batch_op.add_column(sa.Column("start_time", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("end_time", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(), nullable=False, server_default="SCHEDULED"))
        batch_op.add_column(sa.Column("results_visible", sa.Boolean(), nullable=False, server_default=sa.text("0")))

    op.create_table(
        "exam_questions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("exam_id", sa.String(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("options", sa.Text(), nullable=True),
        sa.Column("correct_answer", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exam_questions_exam_id", "exam_questions", ["exam_id"], unique=False)

    op.create_table(
        "exam_attempts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("exam_id", sa.String(), nullable=False),
        sa.Column("student_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="IN_PROGRESS"),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("auto_submit_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("violation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_flagged", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("flagged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("flag_reason", sa.String(), nullable=True),
        sa.CheckConstraint("status IN ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED')", name="ck_exam_attempt_status"),
        sa.CheckConstraint("submitted_at IS NULL OR submitted_at >= start_time", name="ck_exam_attempt_submitted_after_start"),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "exam_id", name="uq_exam_attempt_student_exam"),
    )
    op.create_index("ix_exam_attempts_exam_id", "exam_attempts", ["exam_id"], unique=False)
    op.create_index("ix_exam_attempts_student_id", "exam_attempts", ["student_id"], unique=False)

    op.create_table(
        "exam_answers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(), nullable=False),
        sa.Column("question_id", sa.String(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("last_saved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["attempt_id"], ["exam_attempts.id"]),
        sa.ForeignKeyConstraint(["question_id"], ["exam_questions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", "question_id", name="uq_exam_answer_attempt_question"),
    )
    op.create_index("ix_exam_answers_attempt_id", "exam_answers", ["attempt_id"], unique=False)
    op.create_index("ix_exam_answers_question_id", "exam_answers", ["question_id"], unique=False)

    with op.batch_alter_table("violations") as batch_op:
        batch_op.add_column(sa.Column("attempt_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))

    with op.batch_alter_table("exam_sessions") as batch_op:
        batch_op.add_column(sa.Column("attempt_id", sa.String(), nullable=True))

    op.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_attempt_auto_submit_insert
        BEFORE INSERT ON exam_attempts
        FOR EACH ROW
        BEGIN
          SELECT CASE
            WHEN NEW.auto_submit_time > (SELECT end_time FROM exams WHERE id = NEW.exam_id)
            THEN RAISE(ABORT, 'auto_submit_time exceeds exam end_time')
          END;
        END;
        """
    )
    op.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_attempt_auto_submit_update
        BEFORE UPDATE OF auto_submit_time, exam_id ON exam_attempts
        FOR EACH ROW
        BEGIN
          SELECT CASE
            WHEN NEW.auto_submit_time > (SELECT end_time FROM exams WHERE id = NEW.exam_id)
            THEN RAISE(ABORT, 'auto_submit_time exceeds exam end_time')
          END;
        END;
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_attempt_auto_submit_update")
    op.execute("DROP TRIGGER IF EXISTS trg_attempt_auto_submit_insert")

    with op.batch_alter_table("exam_sessions") as batch_op:
        batch_op.drop_column("attempt_id")

    with op.batch_alter_table("violations") as batch_op:
        batch_op.drop_column("timestamp")
        batch_op.drop_column("attempt_id")

    op.drop_index("ix_exam_answers_question_id", table_name="exam_answers")
    op.drop_index("ix_exam_answers_attempt_id", table_name="exam_answers")
    op.drop_table("exam_answers")

    op.drop_index("ix_exam_attempts_student_id", table_name="exam_attempts")
    op.drop_index("ix_exam_attempts_exam_id", table_name="exam_attempts")
    op.drop_table("exam_attempts")

    op.drop_index("ix_exam_questions_exam_id", table_name="exam_questions")
    op.drop_table("exam_questions")

    with op.batch_alter_table("exams") as batch_op:
        batch_op.drop_column("results_visible")
        batch_op.drop_column("status")
        batch_op.drop_column("end_time")
        batch_op.drop_column("start_time")
