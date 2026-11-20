"""promote exam wizard_config fields to columns

Revision ID: 0016_promote_exam_wizard_config_fields
Revises: 0015_add_exam_attempt_question_ids
Create Date: 2026-11-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_promote_exam_wizard_config_fields"
down_revision = "0015_add_exam_attempt_question_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("exams", sa.Column("total_marks", sa.Integer(), nullable=True))
    op.add_column("exams", sa.Column("passing_marks", sa.Integer(), nullable=True))
    op.add_column("exams", sa.Column("violation_threshold", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("exams", sa.Column("violation_action", sa.String(), nullable=False, server_default="warn"))
    op.add_column("exams", sa.Column("visible_before_start", sa.Boolean(), nullable=False, server_default="0"))
    op.add_column("exams", sa.Column("question_pool_mode", sa.String(), nullable=False, server_default="fixed"))
    op.add_column("exams", sa.Column("pool_draw_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "pool_draw_count")
    op.drop_column("exams", "question_pool_mode")
    op.drop_column("exams", "visible_before_start")
    op.drop_column("exams", "violation_action")
    op.drop_column("exams", "violation_threshold")
    op.drop_column("exams", "passing_marks")
    op.drop_column("exams", "total_marks")
    op.drop_column("exams", "max_attempts")
