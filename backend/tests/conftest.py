import os
import sys
import tempfile
from pathlib import Path

import pytest

# Point the app at a throwaway SQLite file before any app module creates its engine.
_TEST_DB_DIR = tempfile.mkdtemp(prefix="smartproctor-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TEST_DB_DIR, 'test.db').as_posix()}"

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import importlib  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402

# Register every table on Base (app/models is a namespace package without __init__).
for _module in sorted(Path(backend_dir, "app", "models").glob("*.py")):
    importlib.import_module(f"app.models.{_module.stem}")


@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
