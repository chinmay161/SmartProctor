# Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
"""add session_events table

Revision ID: 0006_add_session_events
Revises: 0005_drop_custom_session_tables
Create Date: 2026-10-24 22:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0006_add_session_events"
down_revision: Union[str, Sequence[str], None] = "0005_drop_custom_session_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())
    if "session_events" not in existing:
        op.create_table(
            "session_events",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("trace_id", sa.String(length=64), nullable=False),
            sa.Column("session_id", sa.String(length=36), nullable=True),
            sa.Column("exam_id", sa.String(length=36), nullable=True),
            sa.Column("student_id", sa.String(length=128), nullable=False),
            sa.Column("seq", sa.Integer(), nullable=False),
            sa.Column("client_ts", sa.BigInteger(), nullable=True),
            sa.Column("server_ts", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=False),
            sa.Column("name", sa.String(length=64), nullable=False),
            sa.Column("data", sa.JSON(), nullable=True),
            sa.Column("request_id", sa.String(length=64), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_session_events_trace_id_seq", "session_events", ["trace_id", "seq"], unique=False)
        op.create_index("ix_session_events_session_id_server_ts", "session_events", ["session_id", "server_ts"], unique=False)
        op.create_index("ix_session_events_trace_id", "session_events", ["trace_id"], unique=False)
        op.create_index("ix_session_events_session_id", "session_events", ["session_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())
    if "session_events" in existing:
        op.drop_index("ix_session_events_session_id", table_name="session_events")
        op.drop_index("ix_session_events_trace_id", table_name="session_events")
        op.drop_index("ix_session_events_session_id_server_ts", table_name="session_events")
        op.drop_index("ix_session_events_trace_id_seq", table_name="session_events")
        op.drop_table("session_events")
