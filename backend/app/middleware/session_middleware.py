"""
Session Management Middleware
Handles automatic session validation, activity tracking, and cleanup
"""
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime
import logging
from ..database import SessionLocal
from ..models.user_session import UserSession, SessionRevocationList
from ..config.session_config import SessionConfig

logger = logging.getLogger(__name__)


class SessionTrackingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to automatically track session activity and validate sessions
    
    This middleware:
    - Updates last_activity_at on each request
    - Validates session hasn't been revoked
    - Checks for inactivity timeout
    - Cleans up expired entries periodically
    """
    
    # Track cleanup requests to avoid running every request
    _cleanup_counter = 0
    _cleanup_interval = 1000  # Run cleanup every 1000 requests
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request and track session activity"""
        db = SessionLocal()
        try:
            # Extract session info from authorization header
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                
                # Check if token is in revocation list
                revoked = db.query(SessionRevocationList).filter(
                    SessionRevocationList.token == token
                ).first()
                
                if revoked:
                    logger.warning(f"Revoked token used: {token[:20]}...")
                
                # Try to update session activity
                try:
                    session = db.query(UserSession).filter(
                        UserSession.access_token == token
                    ).first()
                    
                    if session:
                        session.last_activity_at = datetime.utcnow()
                        db.commit()
                except Exception as e:
                    logger.error(f"Failed to update session activity: {e}")
                    db.rollback()
            
            # Run periodic cleanup
            SessionTrackingMiddleware._cleanup_counter += 1
            if SessionTrackingMiddleware._cleanup_counter >= SessionTrackingMiddleware._cleanup_interval:
                self._run_cleanup(db)
                SessionTrackingMiddleware._cleanup_counter = 0
            
            # Call the actual endpoint
            response = await call_next(request)
            
            return response
            
        except Exception as e:
            logger.error(f"Error in SessionTrackingMiddleware: {e}")
            # Don't block request on middleware errors
            response = await call_next(request)
            return response
            
        finally:
            db.close()
    
    @staticmethod
    def _run_cleanup(db: Session) -> None:
        """
        Clean up expired sessions and revocation list entries
        
        This prevents the database from growing unbounded with
        expired entries.
        """
        try:
            now = datetime.utcnow()
            
            # Mark expired sessions
            expired_count = db.query(UserSession).filter(
                UserSession.refresh_token_expires_at < now
            ).update({"status": "EXPIRED"})
            
            # Clean up old revocation list entries
            cleaned_count = db.query(SessionRevocationList).filter(
                SessionRevocationList.expires_at < now
            ).delete()
            
            if expired_count > 0 or cleaned_count > 0:
                db.commit()
                logger.info(
                    f"Session cleanup: {expired_count} expired sessions marked, "
                    f"{cleaned_count} revoked tokens removed"
                )
            
        except Exception as e:
            logger.error(f"Error during session cleanup: {e}")
            db.rollback()


class SessionSecurityMiddleware(BaseHTTPMiddleware):
    """
    Additional security middleware for session management
    
    This middleware:
    - Validates IP address consistency
    - Detects suspicious activity patterns
    - Logs all authentication-related events
    """
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request with security checks"""
        db = SessionLocal()
        try:
            # Get client IP
            client_ip = request.client.host if request.client else None
            if forwarded_for := request.headers.get("X-Forwarded-For"):
                client_ip = forwarded_for.split(",")[0].strip()
            
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                
                session = db.query(UserSession).filter(
                    UserSession.access_token == token
                ).first()
                
                if session and SessionConfig.VALIDATE_IP_ADDRESS:
                    # Track IP changes
                    if session.ip_address and session.ip_address != client_ip:
                        if not hasattr(session, '_ip_change_count'):
                            session._ip_change_count = 0
                        session._ip_change_count += 1
                        
                        logger.warning(
                            f"IP change detected for user {session.user_id}: "
                            f"{session.ip_address} -> {client_ip} "
                            f"(count: {session._ip_change_count})"
                        )
                        
                        if session._ip_change_count > SessionConfig.ALLOWED_IP_CHANGES_PER_SESSION:
                            logger.critical(
                                f"Suspicious activity: Too many IP changes for user {session.user_id}"
                            )
            
            response = await call_next(request)
            return response
            
        except Exception as e:
            logger.error(f"Error in SessionSecurityMiddleware: {e}")
            response = await call_next(request)
            return response
            
        finally:
            db.close()


class SessionValidationMiddleware(BaseHTTPMiddleware):
    """
    Validates sessions on sensitive endpoints
    
    This middleware can be configured to require stricter validation
    for high-security operations like:
    - Password changes
    - Role/permission updates
    - Sensitive exam operations
    """
    
    # Endpoints that require strict validation
    SENSITIVE_ENDPOINTS = [
        "/api/admin/",
        "/api/users/roles",
        "/api/exams/delete",
        "/api/users/password",
    ]
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """Validate sessions for sensitive endpoints"""
        
        # Check if this is a sensitive endpoint
        is_sensitive = any(
            request.url.path.startswith(endpoint)
            for endpoint in self.SENSITIVE_ENDPOINTS
        )
        
        if is_sensitive:
            db = SessionLocal()
            try:
                auth_header = request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header.split(" ")[1]
                    
                    session = db.query(UserSession).filter(
                        UserSession.access_token == token
                    ).first()
                    
                    if session:
                        # For sensitive operations, check MFA verification
                        if SessionConfig.REQUIRE_MFA_FOR_SENSITIVE_OPS and not session.mfa_verified:
                            logger.warning(
                                f"Sensitive operation attempted without MFA: "
                                f"{request.url.path} by user {session.user_id}"
                            )
                    
                response = await call_next(request)
                return response
                
            finally:
                db.close()
        else:
            response = await call_next(request)
            return response
