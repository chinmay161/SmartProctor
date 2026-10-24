from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.database import Base, DATABASE_URL, engine
from app.models.audit import RoleAuditLog
from app.models.enrollment import ExamEnrollment
from app.models.exam import Exam
from app.models.exam_answer import ExamAnswer
from app.models.exam_attempt import ExamAttempt
from app.models.exam_question import ExamQuestion
from app.models.exam_rules import ExamRules
from app.models.exam_session import ExamSession
from app.models.proctor import ProctorAssignment
from app.models.question import Question
from app.models.snapshot import Snapshot
from app.models.user_profile import UserProfile
from app.models.violation import Violation

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = context.config.attributes.get("connection", None)
    if connectable is None:
        connectable = engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=DATABASE_URL.startswith("sqlite"),
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
