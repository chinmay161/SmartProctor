"""
Session Management Routes
Endpoints for session creation, validation, refresh, and invalidation
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from pydantic import BaseModel

from ..database import SessionLocal
from ..auth.session_dependencies import (
    get_db, get_session_manager, get_client_info,
    get_current_session, require_mfa_verification
)
from ..services.session_manager import SessionManager
from ..config.session_config import SessionConfig


# ==================== Pydantic Schemas ====================

class LoginRequest(BaseModel):
    """Login request schema"""
    user_id: str
    password: Optional[str] = None  # Would be validated separately
    device_name: Optional[str] = None
    is_mobile: bool = False


class LoginResponse(BaseModel):
    """Login response schema"""
    session_id: str
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    access_token_expires_at: str
    refresh_token_expires_at: str
    created_at: str


class RefreshTokenRequest(BaseModel):
    """Token refresh request schema"""
    session_id: str
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Token refresh response schema"""
    session_id: str
    access_token: str
    token_type: str
    expires_in: int
    access_token_expires_at: str


class LogoutRequest(BaseModel):
    """Logout request schema"""
    session_id: str
    all_devices: bool = False  # Logout all sessions


class SessionInfo(BaseModel):
    """Session information schema"""
    session_id: str
    created_at: str
    last_activity_at: str
    expires_at: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_mobile: bool
    status: str
    refresh_count: int


class UserSessionsResponse(BaseModel):
    """User's active sessions list"""
    sessions: list[SessionInfo]
    total: int
    current_session_id: Optional[str] = None


# ==================== Router Setup ====================

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ==================== Login Endpoint ====================

@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
):
    """
    Create a new user session after authentication
    
    This endpoint should be called after the user has been authenticated
    (e.g., after verifying password or OAuth token).
    
    - **user_id**: ID of authenticated user
    - **device_name**: Optional device identifier
    - **is_mobile**: Whether this is a mobile client
    
    Returns:
    - **access_token**: Short-lived token for API requests (15 min default)
    - **refresh_token**: Long-lived token for getting new access tokens (7 days)
    - **session_id**: Unique session identifier
    """
    client_info = get_client_info(request)
    
    try:
        session = session_manager.create_session(
            db=db,
            user_id=login_data.user_id,
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
            device_fingerprint=client_info["device_fingerprint"],
            is_mobile=login_data.is_mobile,
            metadata={
                "device_name": login_data.device_name,
                "login_time": request.headers.get("date"),
            },
        )
        return session
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


# ==================== Token Refresh Endpoint ====================

@router.post(
    "/refresh",
    response_model=RefreshTokenResponse,
)
async def refresh_access_token(
    request: Request,
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
):
    """
    Refresh an access token using a refresh token
    
    Use this endpoint when your access token is about to expire.
    This provides a seamless experience without requiring the user
    to log in again.
    
    - **session_id**: Session ID from login response
    - **refresh_token**: Refresh token from login response
    
    Returns:
    - **access_token**: New short-lived access token
    - **expires_in**: Seconds until token expires
    
    Limits:
    - Each session can be refreshed max 10 times
    - Refresh window is 7 days (or configured value)
    - Inactivity timeout still applies
    """
    client_info = get_client_info(request)
    
    try:
        new_tokens = session_manager.refresh_session(
            db=db,
            session_id=refresh_data.session_id,
            refresh_token=refresh_data.refresh_token,
            user_id="",  # Will be extracted from session lookup
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
        )
        return new_tokens
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )


# ==================== Logout/Invalidation Endpoints ====================

@router.post("/logout")
async def logout(
    request: Request,
    logout_data: LogoutRequest,
    current_session: dict = Depends(get_current_session),
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
):
    """
    Logout from current session (invalidate session)
    
    - **session_id**: Session ID to invalidate
    - **all_devices**: If true, invalidates ALL sessions for the user
    
    Security Notes:
    - Immediately revokes all tokens
    - Tokens are added to revocation list
    - IP and device validations are bypassed
    - Audit log records the logout
    """
    client_info = get_client_info(request)
    
    try:
        if logout_data.all_devices:
            result = session_manager.invalidate_all_sessions(
                db=db,
                user_id=current_session["user_id"],
                exclude_session_id=logout_data.session_id,
            )
        else:
            result = session_manager.invalidate_session(
                db=db,
                session_id=logout_data.session_id,
                user_id=current_session["user_id"],
                ip_address=client_info["ip_address"],
                user_agent=client_info["user_agent"],
            )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )


# ==================== Session Info Endpoints ====================

@router.get("/current", response_model=Dict[str, Any])
async def get_current_session_info(
    current_session: dict = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """
    Get information about the current session
    
    Returns details about the currently authenticated session
    """
    from models.user_session import UserSession
    
    db_session = db.query(UserSession).filter(
        UserSession.id == current_session["session_id"]
    ).first()
    
    if not db_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return {
        "session_id": db_session.id,
        "user_id": db_session.user_id,
        "created_at": db_session.created_at.isoformat(),
        "expires_at": db_session.expires_at.isoformat(),
        "last_activity_at": db_session.last_activity_at.isoformat(),
        "access_token_expires_at": db_session.access_token_expires_at.isoformat(),
        "status": db_session.status,
        "is_mobile": db_session.is_mobile,
        "is_trusted_device": db_session.is_trusted_device,
        "ip_address": db_session.ip_address,
    }


@router.get("/active", response_model=UserSessionsResponse)
async def list_active_sessions(
    current_session: dict = Depends(get_current_session),
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
):
    """
    List all active sessions for the current user
    
    Useful for:
    - Showing user where they're logged in
    - Allowing logout from other devices
    - Security monitoring
    - Detecting unauthorized access
    
    Returns:
    - **sessions**: List of active session details
    - **total**: Total number of active sessions
    - **current_session_id**: ID of current session (for UI highlighting)
    """
    user_id = current_session["user_id"]
    
    sessions = session_manager.get_user_sessions(
        db=db,
        user_id=user_id,
        include_expired=False,
    )
    
    return UserSessionsResponse(
        sessions=sessions,
        total=len(sessions),
        current_session_id=current_session["session_id"],
    )


@router.delete("/{session_id}")
async def revoke_session(
    session_id: str,
    current_session: dict = Depends(get_current_session),
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
):
    """
    Revoke a specific session (logout from another device)
    
    Allows users to logout from a specific device without
    affecting other sessions.
    
    - **session_id**: ID of session to revoke
    
    Returns success message with count of revoked sessions
    """
    from config.session_config import SessionConstants
    
    result = session_manager.invalidate_session(
        db=db,
        session_id=session_id,
        user_id=current_session["user_id"],
        reason=SessionConstants.REASON_USER_LOGOUT,
    )
    
    return result


# ==================== Admin Endpoints ====================

@router.post("/cleanup")
async def cleanup_expired_sessions(
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
):
    """
    Clean up expired sessions and revoked tokens
    
    Should be run periodically (e.g., daily) to remove old data
    This is an admin/internal operation
    
    Returns:
    - **expired_sessions_marked**: Count of sessions marked as expired
    - **revoked_tokens_cleaned**: Count of tokens removed from revocation list
    """
    result = session_manager.cleanup_expired_sessions(db=db)
    return result


@router.get("/audit/{session_id}", dependencies=[Depends(get_current_session)])
async def get_session_audit_log(
    session_id: str,
    db: Session = Depends(get_db),
):
    """
    Get audit log for a specific session
    
    Returns all audit events for a session (login, validation, refresh, logout, etc.)
    Requires authentication.
    """
    from models.user_session import SessionAuditLog
    
    logs = db.query(SessionAuditLog).filter(
        SessionAuditLog.session_id == session_id
    ).order_by(SessionAuditLog.timestamp.desc()).all()
    
    return {
        "session_id": session_id,
        "audit_logs": [
            {
                "action": log.action,
                "status": log.status,
                "timestamp": log.timestamp.isoformat(),
                "ip_address": log.ip_address,
                "error_message": log.error_message,
            }
            for log in logs
        ]
    }


@router.get("/user/{user_id}/all", dependencies=[Depends(get_current_session)])
async def get_all_user_sessions_admin(
    user_id: str,
    db: Session = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
):
    """
    Get all sessions for a specific user (admin operation)
    
    Requires authentication. Remove this endpoint or add admin check
    if you want to restrict it further.
    """
    sessions = session_manager.get_user_sessions(
        db=db,
        user_id=user_id,
        include_expired=True,
    )
    
    return {
        "user_id": user_id,
        "sessions": sessions,
        "total": len(sessions),
    }
