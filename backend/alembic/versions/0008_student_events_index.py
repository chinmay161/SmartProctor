# Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
"""add index on session_events (student_id, server_ts)

Revision ID: 0008_student_events_index
Revises: 0007_review_and_problems
Create Date: 2026-10-25 19:45:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0008_student_events_index"
down_revision: Union[str, Sequence[str], None] = "0007_review_and_problems"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "session_events" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("session_events")}
        if "ix_session_events_student_id_server_ts" not in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute(
                    "CREATE INDEX IF NOT EXISTS ix_session_events_student_id_server_ts "
                    "ON session_events (student_id, server_ts)"
                )
            else:
                op.create_index(
                    "ix_session_events_student_id_server_ts",
                    "session_events",
                    ["student_id", "server_ts"],
                    unique=False,
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "session_events" in tables:
        existing_indices = {ix["name"] for ix in inspector.get_indexes("session_events")}
        if "ix_session_events_student_id_server_ts" in existing_indices:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_session_events_student_id_server_ts")
            else:
                op.drop_index("ix_session_events_student_id_server_ts", table_name="session_events")
