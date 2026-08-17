"""
Session Dependencies for FastAPI
Provides dependency injection for session validation and management
"""
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import Optional
from ..database import SessionLocal
from ..models.user_session import UserSession
from ..services.session_manager import SessionManager
import hashlib


def get_db():
    """Get database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_session_manager() -> SessionManager:
    """Get session manager instance"""
    return SessionManager()


def get_client_info(request: Request) -> dict:
    """Extract client information from request"""
    # Get IP address (handle proxies)
    client_ip = request.client.host if request.client else None
    if forwarded_for := request.headers.get("X-Forwarded-For"):
        client_ip = forwarded_for.split(",")[0].strip()
    
    user_agent = request.headers.get("User-Agent", "")
    
    return {
        "ip_address": client_ip,
        "user_agent": user_agent,
        "device_fingerprint": _generate_device_fingerprint(user_agent, client_ip),
    }


def _generate_device_fingerprint(user_agent: str, ip_address: Optional[str]) -> str:
    """
    Generate a device fingerprint from client characteristics
    This is a basic implementation - consider more sophisticated fingerprinting
    """
    fingerprint_data = f"{user_agent}:{ip_address}"
    return hashlib.sha256(fingerprint_data.encode()).hexdigest()


async def get_current_session(
    request: Request,
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
) -> dict:
    """
    Validate current session from Authorization header
    Returns session info and validates it's still active
    
    Dependency to protect routes requiring authentication
    """
    # Extract token from header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = auth_header.split(" ")[1]
    
    # For now, we'll use a simple token lookup
    # In production, you might want to validate JWT structure first
    db_session = db.query(UserSession).filter(
        UserSession.access_token == token
    ).first()
    
    if not db_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get client info
    client_info = get_client_info(request)
    
    # Validate the session
    try:
        session_manager.validate_session(
            db=db,
            session_id=db_session.id,
            user_id=db_session.user_id,
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
            device_fingerprint=client_info["device_fingerprint"],
        )
    except HTTPException:
        raise
    
    return {
        "session_id": db_session.id,
        "user_id": db_session.user_id,
        "access_token": token,
        "ip_address": client_info["ip_address"],
        "user_agent": client_info["user_agent"],
        "roles": [],  # Will be filled by actual auth system
    }


async def require_mfa_verification(
    current_session: dict = Depends(get_current_session),
) -> dict:
    """
    Additional dependency for operations requiring MFA
    Use with current_session to ensure MFA was verified
    """
    # This would check the current_session for mfa_verified flag
    # Implementation depends on your MFA system
    return current_session


async def require_trusted_device(
    current_session: dict = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> dict:
    """
    Dependency for operations that require a trusted device
    """
    db_session = db.query(UserSession).filter(
        UserSession.id == current_session["session_id"]
    ).first()
    
    if not db_session or not db_session.is_trusted_device:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This operation requires a trusted device",
        )
    
    return current_session
