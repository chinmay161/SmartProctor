"""
Secure Session Manager
Core service for session creation, validation, renewal, timeout, and invalidation
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import uuid
import hashlib
import secrets
import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from ..models.user_session import (
    UserSession, SessionRevocationList, SessionAuditLog, SessionStatus
)
from ..config.session_config import SessionConfig, SessionConstants, get_token_expiry_delta
from jose import jwt, JWTError
import os
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Comprehensive session management service handling:
    - Session creation with tokens
    - Session validation and verification
    - Token refresh with rate limiting
    - Session timeout and auto-expiration
    - Session invalidation and revocation
    - Security audit logging
    """
    
    def __init__(self, secret_key: str = None):
        """
        Initialize SessionManager
        
        Args:
            secret_key: JWT signing key (defaults to env variable)
        """
        # Prefer explicit secret_key, fall back to environment.
        # If none provided, generate ephemeral key but log a warning — fail-fast is recommended for production.
        env_key = os.getenv("SECRET_KEY")
        if secret_key:
            self.secret_key = secret_key
        elif env_key:
            self.secret_key = env_key
        else:
            # Generate an ephemeral secret for local development, but warn loudly
            self.secret_key = secrets.token_urlsafe(64)
            logger.warning("No SECRET_KEY provided; using ephemeral key. Set SECRET_KEY in production.")
        self.algorithm = "HS256"
    
    def create_session(
        self,
        db: Session,
        user_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        device_fingerprint: Optional[str] = None,
        is_mobile: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new user session with tokens
        
        Args:
            db: Database session
            user_id: User ID
            ip_address: Client IP address
            user_agent: Client user agent
            device_fingerprint: Hash of device characteristics
            is_mobile: Whether this is a mobile device
            metadata: Additional session metadata
            
        Returns:
            Dict with access_token, refresh_token, and session details
            
        Raises:
            HTTPException: If session creation fails
        """
        try:
            # Check concurrent sessions limit and revoke if needed
            if not SessionConfig.ALLOW_CONCURRENT_SESSIONS:
                existing_sessions = db.query(UserSession).filter(
                    and_(
                        UserSession.user_id == user_id,
                        UserSession.status == SessionStatus.ACTIVE,
                    )
                ).all()
                for old_session in existing_sessions:
                    try:
                        self._revoke_session(db, old_session, SessionConstants.REASON_CONCURRENT_LOGIN)
                    except Exception:
                        logger.exception("Failed to revoke old session %s", getattr(old_session, "id", None))

            # Create session record first to obtain session id for JWT claims
            now = datetime.utcnow()
            refresh_expires = now + get_token_expiry_delta(SessionConstants.TOKEN_TYPE_REFRESH)
            absolute_refresh_expires = now + timedelta(days=SessionConfig.REFRESH_TOKEN_ABSOLUTE_EXPIRE_DAYS)

            db_session = UserSession(
                user_id=user_id,
                status=SessionStatus.ACTIVE,
                ip_address=ip_address,
                user_agent=user_agent,
                device_fingerprint=device_fingerprint,
                is_mobile=is_mobile,
                expires_at=refresh_expires,
                access_token_expires_at=now,  # will be updated after token generation
                refresh_token_expires_at=absolute_refresh_expires,
                metadata=metadata or {},
            )

            db.add(db_session)
            db.commit()
            db.refresh(db_session)

            # Generate tokens (JWT access token + secure refresh token)
            access_expires = now + get_token_expiry_delta(SessionConstants.TOKEN_TYPE_ACCESS)
            access_token = self._create_access_jwt(db_session.id, user_id, expires_delta=access_expires)
            refresh_token = self._generate_random_token()

            # Persist tokens into the session record
            db_session.access_token = access_token
            db_session.refresh_token = refresh_token
            db_session.access_token_expires_at = access_expires
            db_session.expires_at = refresh_expires
            db_session.refresh_token_expires_at = absolute_refresh_expires
            db.commit()
            db.refresh(db_session)

            # Audit
            self._audit_log(
                db,
                db_session.id,
                user_id,
                SessionConstants.ACTION_CREATE,
                "success",
                ip_address,
                user_agent,
            )

            return {
                "session_id": db_session.id,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "expires_in": int(get_token_expiry_delta(SessionConstants.TOKEN_TYPE_ACCESS).total_seconds()),
                "access_token_expires_at": access_expires.isoformat(),
                "refresh_token_expires_at": absolute_refresh_expires.isoformat(),
                "created_at": db_session.created_at.isoformat(),
            }
        except Exception as e:
            try:
                db.rollback()
            except Exception:
                logger.exception("rollback failed")
            self._audit_log(
                db, "", user_id, SessionConstants.ACTION_CREATE, "failed",
                ip_address, user_agent,
                error_message=str(e)
            )
            logger.exception("Failed to create session for user %s", user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create session"
            )
    
    def validate_session(
        self,
        db: Session,
        session_id: str,
        user_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        device_fingerprint: Optional[str] = None,
    ) -> UserSession:
        """
        Validate an active session with security checks
        
        Args:
            db: Database session
            session_id: Session ID to validate
            user_id: Expected user ID
            ip_address: Current client IP
            user_agent: Current client user agent
            device_fingerprint: Current device fingerprint
            
        Returns:
            UserSession object if valid
            
        Raises:
            HTTPException: If session is invalid, expired, or revoked
        """
        try:
            # Fetch session
            db_session = db.query(UserSession).filter(
                and_(
                    UserSession.id == session_id,
                    UserSession.user_id == user_id,
                )
            ).first()
            
            if not db_session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session not found"
                )
            
            # Check status
            if db_session.status != SessionStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Session is {db_session.status.lower()}"
                )
            
            # Check if revoked
            revoked = db.query(SessionRevocationList).filter(
                SessionRevocationList.token == db_session.access_token
            ).first()
            if revoked:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session has been revoked"
                )
            
            # Check expiration
            now = datetime.utcnow()
            if db_session.access_token_expires_at < now:
                db_session.status = SessionStatus.EXPIRED
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Access token has expired"
                )
            
            # Check inactivity timeout
            inactivity_delta = timedelta(minutes=SessionConfig.INACTIVITY_TIMEOUT_MINUTES)
            if db_session.last_activity_at + inactivity_delta < now:
                db_session.status = SessionStatus.EXPIRED
                db.commit()
                self._audit_log(
                    db, session_id, user_id, SessionConstants.ACTION_TIMEOUT, "success",
                    ip_address, user_agent
                )
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session expired due to inactivity"
                )
            
            # Validate IP address if configured
            if SessionConfig.VALIDATE_IP_ADDRESS and ip_address:
                if db_session.ip_address != ip_address:
                    # Track IP changes
                    if not hasattr(db_session, '_ip_changes'):
                        db_session._ip_changes = 0
                    
                    if db_session._ip_changes >= SessionConfig.ALLOWED_IP_CHANGES_PER_SESSION:
                        self._revoke_session(db, db_session, SessionConstants.REASON_IP_MISMATCH)
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Session requires re-authentication due to IP change"
                        )
                    
                    self._audit_log(
                        db, session_id, user_id, SessionConstants.ACTION_IP_CHANGE, "success",
                        ip_address, user_agent,
                        details={"old_ip": db_session.ip_address, "new_ip": ip_address}
                    )
            
            # Validate device fingerprint if configured
            if SessionConfig.VALIDATE_DEVICE_FINGERPRINT and device_fingerprint:
                if db_session.device_fingerprint and db_session.device_fingerprint != device_fingerprint:
                    self._revoke_session(db, db_session, SessionConstants.REASON_DEVICE_MISMATCH)
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Session requires re-authentication due to device mismatch"
                    )
            
            # Update last activity
            db_session.last_activity_at = now
            db.commit()
            
            self._audit_log(
                db, session_id, user_id, SessionConstants.ACTION_VALIDATE, "success",
                ip_address, user_agent
            )
            
            return db_session
            
        except HTTPException:
            raise
        except Exception as e:
            self._audit_log(
                db, session_id, user_id, SessionConstants.ACTION_VALIDATE, "failed",
                ip_address, user_agent,
                error_message=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Session validation failed"
            )
    
    def refresh_session(
        self,
        db: Session,
        session_id: str,
        refresh_token: str,
        user_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Renew session tokens (refresh access token)
        
        Args:
            db: Database session
            session_id: Session ID
            refresh_token: Refresh token value
            user_id: User ID
            ip_address: Client IP address
            user_agent: Client user agent
            
        Returns:
            Dict with new access token and expiration
            
        Raises:
            HTTPException: If refresh fails
        """
        try:
            # Fetch session
            db_session = db.query(UserSession).filter(
                and_(
                    UserSession.id == session_id,
                    UserSession.user_id == user_id,
                    UserSession.refresh_token == refresh_token,
                )
            ).first()
            
            if not db_session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid refresh token"
                )
            
            # Check status
            if db_session.status != SessionStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session is not active"
                )
            
            # Check refresh token expiration
            now = datetime.utcnow()
            if db_session.refresh_token_expires_at < now:
                db_session.status = SessionStatus.EXPIRED
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token has expired"
                )
            
            # Check refresh count limit
            if db_session.refresh_count >= db_session.max_refresh_count:
                self._revoke_session(db, db_session, SessionConstants.REASON_SECURITY_BREACH)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Maximum refresh attempts exceeded - re-authentication required"
                )
            
            # Check inactivity timeout
            inactivity_delta = timedelta(minutes=SessionConfig.INACTIVITY_TIMEOUT_MINUTES)
            if db_session.last_activity_at + inactivity_delta < now:
                db_session.status = SessionStatus.EXPIRED
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session expired due to inactivity"
                )
            
            # Revoke old access token
            self._add_to_revocation_list(
                db, db_session.access_token,
                SessionConstants.TOKEN_TYPE_ACCESS,
                user_id,
                db_session.access_token_expires_at,
            )

            # Generate new access token (JWT)
            new_access_expires = now + get_token_expiry_delta(SessionConstants.TOKEN_TYPE_ACCESS)
            new_access_token = self._create_access_jwt(db_session.id, user_id, expires_delta=new_access_expires)

            # Update session
            db_session.access_token = new_access_token
            db_session.access_token_expires_at = new_access_expires
            db_session.refresh_count += 1
            db_session.last_activity_at = now
            db.commit()
            
            self._audit_log(
                db, session_id, user_id, SessionConstants.ACTION_REFRESH, "success",
                ip_address, user_agent,
                details={"refresh_count": db_session.refresh_count}
            )
            
            return {
                "session_id": session_id,
                "access_token": new_access_token,
                "token_type": "bearer",
                "expires_in": int(get_token_expiry_delta(SessionConstants.TOKEN_TYPE_ACCESS).total_seconds()),
                "access_token_expires_at": new_access_expires.isoformat(),
            }
            
        except HTTPException:
            raise
        except Exception as e:
            self._audit_log(
                db, session_id, user_id, SessionConstants.ACTION_REFRESH, "failed",
                ip_address, user_agent,
                error_message=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Token refresh failed"
            )
    
    def invalidate_session(
        self,
        db: Session,
        session_id: str,
        user_id: str,
        reason: str = SessionConstants.REASON_USER_LOGOUT,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Invalidate/logout a session immediately
        
        Args:
            db: Database session
            session_id: Session ID to invalidate
            user_id: User ID
            reason: Reason for invalidation
            ip_address: Client IP address
            user_agent: Client user agent
            
        Returns:
            Dict confirming invalidation
        """
        try:
            db_session = db.query(UserSession).filter(
                and_(
                    UserSession.id == session_id,
                    UserSession.user_id == user_id,
                )
            ).first()
            
            if not db_session:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Session not found"
                )
            
            # Revoke the session
            self._revoke_session(db, db_session, reason)
            
            self._audit_log(
                db, session_id, user_id, SessionConstants.ACTION_LOGOUT, "success",
                ip_address, user_agent,
                details={"reason": reason}
            )
            
            return {
                "message": "Session invalidated successfully",
                "session_id": session_id,
            }
            
        except HTTPException:
            raise
        except Exception as e:
            self._audit_log(
                db, session_id, user_id, SessionConstants.ACTION_LOGOUT, "failed",
                ip_address, user_agent,
                error_message=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Session invalidation failed"
            )
    
    def invalidate_all_sessions(
        self,
        db: Session,
        user_id: str,
        reason: str = SessionConstants.REASON_SECURITY_BREACH,
        exclude_session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Invalidate all sessions for a user (e.g., after password change)
        
        Args:
            db: Database session
            user_id: User ID
            reason: Reason for invalidation
            exclude_session_id: Session to keep active (optional)
            
        Returns:
            Dict with count of invalidated sessions
        """
        try:
            query = db.query(UserSession).filter(
                and_(
                    UserSession.user_id == user_id,
                    UserSession.status == SessionStatus.ACTIVE,
                )
            )
            
            if exclude_session_id:
                query = query.filter(UserSession.id != exclude_session_id)
            
            sessions = query.all()
            
            for session in sessions:
                self._revoke_session(db, session, reason)
            
            self._audit_log(
                db, "", user_id, SessionConstants.ACTION_LOGOUT, "success",
                details={
                    "reason": reason,
                    "count": len(sessions),
                    "action": "invalidate_all_sessions"
                }
            )
            
            return {
                "message": "All sessions invalidated",
                "invalidated_count": len(sessions),
            }
            
        except Exception as e:
            self._audit_log(
                db, "", user_id, SessionConstants.ACTION_LOGOUT, "failed",
                error_message=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to invalidate all sessions"
            )
    
    def get_user_sessions(
        self,
        db: Session,
        user_id: str,
        include_expired: bool = False,
    ) -> list[Dict[str, Any]]:
        """
        Get all sessions for a user
        
        Args:
            db: Database session
            user_id: User ID
            include_expired: Whether to include expired sessions
            
        Returns:
            List of session details
        """
        query = db.query(UserSession).filter(UserSession.user_id == user_id)
        
        if not include_expired:
            query = query.filter(UserSession.status == SessionStatus.ACTIVE)
        
        sessions = query.all()
        
        return [
            {
                "session_id": s.id,
                "created_at": s.created_at.isoformat(),
                "last_activity_at": s.last_activity_at.isoformat(),
                "expires_at": s.expires_at.isoformat(),
                "ip_address": s.ip_address,
                "user_agent": s.user_agent,
                "is_mobile": s.is_mobile,
                "status": s.status,
                "refresh_count": s.refresh_count,
            }
            for s in sessions
        ]
    
    def cleanup_expired_sessions(self, db: Session) -> Dict[str, int]:
        """
        Clean up expired sessions and tokens (run periodically)
        
        Args:
            db: Database session
            
        Returns:
            Dict with counts of cleaned up items
        """
        try:
            now = datetime.utcnow()
            
            # Mark expired user sessions
            expired_sessions = db.query(UserSession).filter(
                and_(
                    UserSession.refresh_token_expires_at < now,
                    UserSession.status != SessionStatus.EXPIRED,
                )
            ).all()
            
            for session in expired_sessions:
                session.status = SessionStatus.EXPIRED
            
            # Clean up revocation list (remove expired entries)
            deleted_tokens = db.query(SessionRevocationList).filter(
                SessionRevocationList.expires_at < now
            ).delete()
            
            db.commit()
            
            return {
                "expired_sessions_marked": len(expired_sessions),
                "revoked_tokens_cleaned": deleted_tokens,
            }
            
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cleanup failed"
            )
    
    # ==================== Private Helper Methods ====================
    
    def _generate_token(self, token_type: str) -> str:
        """Backwards-compatible wrapper. Prefer explicit JWT/refresh token methods."""
        return self._generate_random_token()

    def _generate_random_token(self, length: int = 64) -> str:
        """Generate a secure opaque token suitable for refresh tokens."""
        return secrets.token_urlsafe(length)

    def _create_access_jwt(self, session_id: str, user_id: str, expires_delta: datetime) -> str:
        """Create a signed JWT access token with standard claims."""
        jti = str(uuid.uuid4())
        now = datetime.utcnow()
        payload = {
            "sub": user_id,
            "jti": jti,
            "iat": int(now.timestamp()),
            "exp": int(expires_delta.timestamp()),
            "typ": "access",
            "sid": session_id,
        }
        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        return token
    
    def _revoke_session(
        self,
        db: Session,
        db_session: UserSession,
        reason: str,
    ) -> None:
        """Mark session as revoked and add tokens to revocation list"""
        db_session.status = SessionStatus.REVOKED
        db_session.revoked_at = datetime.utcnow()
        
        # Add tokens to revocation list
        self._add_to_revocation_list(
            db, db_session.access_token,
            SessionConstants.TOKEN_TYPE_ACCESS,
            db_session.user_id,
            db_session.access_token_expires_at,
            reason
        )
        
        self._add_to_revocation_list(
            db, db_session.refresh_token,
            SessionConstants.TOKEN_TYPE_REFRESH,
            db_session.user_id,
            db_session.refresh_token_expires_at,
            reason
        )
        
        db.commit()
    
    def _add_to_revocation_list(
        self,
        db: Session,
        token: str,
        token_type: str,
        user_id: str,
        expires_at: datetime,
        reason: str = SessionConstants.REASON_USER_LOGOUT,
    ) -> None:
        """Add a token to the revocation list"""
        revocation = SessionRevocationList(
            token=token,
            token_type=token_type,
            user_id=user_id,
            expires_at=expires_at,
            reason=reason,
        )
        db.add(revocation)
        db.commit()
    
    def _audit_log(
        self,
        db: Session,
        session_id: str,
        user_id: str,
        action: str,
        status: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[Dict] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Log session audit event"""
        try:
            log = SessionAuditLog(
                session_id=session_id,
                user_id=user_id,
                action=action,
                status=status,
                ip_address=ip_address,
                user_agent=user_agent,
                details=details or {},
                error_message=error_message,
            )
            db.add(log)
            db.commit()
        except Exception:
            # Don't let logging failures crash the system
            db.rollback()
