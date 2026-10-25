from pathlib import Path
from contextlib import asynccontextmanager

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*args, **kwargs):  # type: ignore[override]
        return False
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import os
import re

# Load backend/app/.env before importing routers/services that read env vars
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from .monitoring import init_sentry, RequestIdAndLoggingMiddleware
init_sentry()

environment = os.getenv("ENVIRONMENT", "development").strip().lower()
is_production = environment == "production"

# In production: fail fast at startup if required variables are missing (log names only)
if is_production:
    required_vars = ["AUTH0_DOMAIN", "AUTH0_API_AUDIENCE", "DATABASE_URL", "CORS_ORIGINS"]
    missing_vars = [var for var in required_vars if not os.getenv(var, "").strip()]
    if missing_vars:
        missing_str = ", ".join(missing_vars)
        logging.getLogger("uvicorn.error").error(
            f"FATAL: Missing required environment variables in production: {missing_str}"
        )
        raise RuntimeError(f"Missing required production environment variables: {missing_str}")

class TokenRedactionFilter(logging.Filter):
    """Redacts query string token values in uvicorn access logs (e.g. WebSocket tokens)."""
    _TOKEN_REGEX = re.compile(r"([?&]token=)[^&\s\"'`]+")

    def _redact(self, text: str) -> str:
        return self._TOKEN_REGEX.sub(r"\g<1>REDACTED", text)

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self._redact(record.msg)
        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(
                    self._redact(arg) if isinstance(arg, str) else arg
                    for arg in record.args
                )
            elif isinstance(record.args, dict):
                record.args = {
                    k: (self._redact(v) if isinstance(v, str) else v)
                    for k, v in record.args.items()
                }
        return True


# Install token redaction filter on uvicorn access logger
access_logger = logging.getLogger("uvicorn.access")
if not any(isinstance(f, TokenRedactionFilter) for f in access_logger.filters):
    access_logger.addFilter(TokenRedactionFilter())

from .routes import attempts, student, teacher, admin, violations
from .database import engine, Base, ensure_schema_compatibility
from .models import audit
from .models.question import Question
from .models.exam_answer import ExamAnswer
from .models.exam_attempt import ExamAttempt
from .models.exam_question import ExamQuestion
from .routes import exams, enrollments, sessions, proctoring, ai
from .routes import questions
from .routes import analytics
from .routes import ws_proctoring, ws_signaling
from .models.user_profile import UserProfile
from .services.auto_submit_worker import AutoSubmitWorker

worker = AutoSubmitWorker()


@asynccontextmanager
async def lifespan(_: FastAPI):
    worker.start()
    try:
        yield
    finally:
        worker.shutdown()


raw_cors_origins = os.getenv("CORS_ORIGINS")
if raw_cors_origins:
    cors_origins = [origin.strip() for origin in raw_cors_origins.split(",") if origin.strip()]
else:
    cors_origins = ["http://localhost:5173"]
if not cors_origins:
    cors_origins = ["http://localhost:5173"]

if is_production:
    if any(origin == "*" for origin in cors_origins):
        logging.getLogger("uvicorn.error").error(
            "FATAL: Wildcard CORS origin '*' is forbidden when ENVIRONMENT=production"
        )
        raise RuntimeError("CORS_ORIGINS cannot contain '*' in production")

app = FastAPI(
    title="SmartProctor API",
    description="Secure exam proctoring platform",
    version="1.0.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
    lifespan=lifespan,
)

# Initialize database and create all tables
Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()

# Add CORS middleware (configure as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestIdAndLoggingMiddleware)

# Mount evidence static files only in non-production local storage mode
evidence_storage_mode = os.getenv("EVIDENCE_STORAGE", "local").strip().lower()
environment = os.getenv("ENVIRONMENT", "development").strip().lower()
if evidence_storage_mode == "local" and environment != "production":
    os.makedirs("data/evidence", exist_ok=True)
    app.mount("/evidence", StaticFiles(directory="data/evidence"), name="evidence")

# Include routers
app.include_router(student.router)
app.include_router(teacher.router)
app.include_router(admin.router)
app.include_router(exams.router)
app.include_router(enrollments.router)
app.include_router(sessions.router)
app.include_router(attempts.router)
app.include_router(proctoring.router)
app.include_router(ai.router)
app.include_router(violations.router)
app.include_router(ws_proctoring.router)
app.include_router(ws_signaling.router)
app.include_router(questions.router)
app.include_router(analytics.router)
from .routes import profile, telemetry, notifications
app.include_router(profile.router)
app.include_router(telemetry.router)
app.include_router(notifications.router)


@app.get("/")
def read_root():
    """Health check and version endpoint"""
    return {
        "message": "SmartProctor backend is running",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/health")
def health_check():
    """Detailed health check endpoint"""
    return {
        "status": "healthy",
        "service": "SmartProctor API",
    }
