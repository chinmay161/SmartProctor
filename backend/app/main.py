from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*args, **kwargs):  # type: ignore[override]
        return False
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load backend/app/.env before importing routers/services that read env vars
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from .routes import student, teacher, admin
from .database import engine, Base
from .models import audit
from .routes import exams, enrollments, sessions, proctoring
from .routes import session_management
from .middleware.session_middleware import (
    SessionTrackingMiddleware,
    SessionSecurityMiddleware,
    SessionValidationMiddleware,
)

# Import session models to ensure they're created
from .models.user_session import UserSession, SessionRevocationList, SessionAuditLog
from .models.user_profile import UserProfile

app = FastAPI(
    title="SmartProctor API",
    description="Secure exam proctoring platform with advanced session management",
    version="1.0.0"
)

# Initialize database and create all tables
Base.metadata.create_all(bind=engine)

# Add CORS middleware (configure as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add session middleware (order matters - process in reverse order of addition)
# Security validation happens first
app.add_middleware(SessionValidationMiddleware)
# Then general security checks
app.add_middleware(SessionSecurityMiddleware)
# Finally activity tracking (runs last, so processes first)
app.add_middleware(SessionTrackingMiddleware)

# Include routers
app.include_router(student.router)
app.include_router(teacher.router)
app.include_router(admin.router)
app.include_router(exams.router)
app.include_router(enrollments.router)
app.include_router(sessions.router)
app.include_router(proctoring.router)
# Include secure session management routes
app.include_router(session_management.router)
from .routes import profile
app.include_router(profile.router)


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
        "session_management": "enabled"
    }
