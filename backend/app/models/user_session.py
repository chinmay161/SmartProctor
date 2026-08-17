"""
User Session Model for secure session management
Tracks login sessions with creation, expiration, and security metadata
"""
from sqlalchemy import Column, String, DateTime, Boolean, Integer, JSON
from sqlalchemy.sql import func
from ..database import Base
import uuid
from enum import Enum


class SessionStatus(str, Enum):
    """Session lifecycle states"""
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    INVALIDATED = "INVALIDATED"


class UserSession(Base):
    """Stores user session data with security audit trail"""
    __tablename__ = "user_sessions"

    # Primary identifiers
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    
    # Session tokens
    access_token = Column(String, nullable=False, unique=True)
    refresh_token = Column(String, nullable=False, unique=True)
    
    # Status tracking
    status = Column(String, default=SessionStatus.ACTIVE, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_activity_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    access_token_expires_at = Column(DateTime(timezone=True), nullable=False)
    refresh_token_expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    
    # Security metadata
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    device_fingerprint = Column(String, nullable=True)  # Hash of device info
    
    # Session configuration
    is_mobile = Column(Boolean, default=False)
    is_trusted_device = Column(Boolean, default=False)
    
    # Refresh tracking
    refresh_count = Column(Integer, default=0)
    max_refresh_count = Column(Integer, default=10)  # Prevent unlimited refreshes
    
    # Security info
    mfa_verified = Column(Boolean, default=False)
    login_location = Column(String, nullable=True)
    
    # Metadata
    session_metadata = Column(JSON, default={}, nullable=True)


class SessionRevocationList(Base):
    """Maintains a blacklist of revoked tokens for immediate invalidation"""
    __tablename__ = "session_revocation_list"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    token = Column(String, nullable=False, unique=True, index=True)
    token_type = Column(String, nullable=False)  # 'access' or 'refresh'
    user_id = Column(String, nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)  # Auto cleanup after expiration
    reason = Column(String, nullable=True)  # logout, security, etc.


class SessionAuditLog(Base):
    """Audit trail for all session operations for security monitoring"""
    __tablename__ = "session_audit_logs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    
    action = Column(String, nullable=False)  # create, validate, refresh, revoke, timeout, etc.
    status = Column(String, nullable=False)  # success, failed
    
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    details = Column(JSON, default={}, nullable=True)  # Additional context
    error_message = Column(String, nullable=True)  # Error details if status is failed
