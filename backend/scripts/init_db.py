import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

# Import every model module so Base.metadata is fully populated
import app.models.audit  # noqa: F401
import app.models.enrollment  # noqa: F401
import app.models.exam  # noqa: F401
import app.models.exam_answer  # noqa: F401
import app.models.exam_attempt  # noqa: F401
import app.models.exam_question  # noqa: F401
import app.models.exam_rules  # noqa: F401
import app.models.exam_session  # noqa: F401
import app.models.proctor  # noqa: F401
import app.models.question  # noqa: F401
import app.models.snapshot  # noqa: F401
import app.models.user_profile  # noqa: F401
import app.models.violation  # noqa: F401

from app.database import Base, DATABASE_URL, engine


def get_alembic_config() -> Config:
    ini_path = backend_dir / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    return cfg


def init_db() -> str:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    cfg = get_alembic_config()

    if "exams" not in existing_tables:
        # Fresh database: Base.metadata.create_all + stamp head
        Base.metadata.create_all(bind=engine)
        command.stamp(cfg, "head")
        path_ran = "Path: FRESH DATABASE (Base.metadata.create_all -> alembic stamp head)"
    else:
        # Existing database: alembic upgrade head
        command.upgrade(cfg, "head")
        path_ran = "Path: EXISTING DATABASE (alembic upgrade head)"

    print(path_ran)
    return path_ran


if __name__ == "__main__":
    init_db()
