"""
Session Configuration and Constants
Defines timeouts, limits, and policies for session management
"""
from datetime import timedelta
import os


class SessionConfig:
    """Session management configuration"""
    
    # Token expiration times
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 15))
    REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 7))
    REFRESH_TOKEN_ABSOLUTE_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_ABSOLUTE_EXPIRE_DAYS", 30))
    
    # Inactivity timeout - session expires if no activity
    INACTIVITY_TIMEOUT_MINUTES = int(os.getenv("INACTIVITY_TIMEOUT_MINUTES", 30))
    
    # Session limits
    MAX_SESSIONS_PER_USER = int(os.getenv("MAX_SESSIONS_PER_USER", 5))
    MAX_REFRESH_COUNT = int(os.getenv("MAX_REFRESH_COUNT", 10))
    
    # Security policies
    REQUIRE_MFA_FOR_SENSITIVE_OPS = os.getenv("REQUIRE_MFA_FOR_SENSITIVE_OPS", "true").lower() == "true"
    ALLOW_CONCURRENT_SESSIONS = os.getenv("ALLOW_CONCURRENT_SESSIONS", "true").lower() == "true"
    ALLOW_CROSS_DEVICE_LOGIN = os.getenv("ALLOW_CROSS_DEVICE_LOGIN", "true").lower() == "true"
    
    # IP and location validation
    VALIDATE_IP_ADDRESS = os.getenv("VALIDATE_IP_ADDRESS", "true").lower() == "true"
    ALLOWED_IP_CHANGES_PER_SESSION = int(os.getenv("ALLOWED_IP_CHANGES_PER_SESSION", 3))
    
    # Device validation
    VALIDATE_DEVICE_FINGERPRINT = os.getenv("VALIDATE_DEVICE_FINGERPRINT", "true").lower() == "true"
    TRACK_TRUSTED_DEVICES = os.getenv("TRACK_TRUSTED_DEVICES", "true").lower() == "true"
    
    # Sensitive operations that require MFA
    SENSITIVE_OPERATIONS = [
        "change_password",
        "update_role",
        "delete_exam",
        "access_audit_logs",
    ]


class SessionConstants:
    """Constants used in session management"""
    
    # Token types
    TOKEN_TYPE_ACCESS = "access"
    TOKEN_TYPE_REFRESH = "refresh"
    
    # Session statuses
    STATUS_ACTIVE = "ACTIVE"
    STATUS_EXPIRED = "EXPIRED"
    STATUS_REVOKED = "REVOKED"
    STATUS_INVALIDATED = "INVALIDATED"
    
    # Audit actions
    ACTION_CREATE = "create"
    ACTION_VALIDATE = "validate"
    ACTION_REFRESH = "refresh"
    ACTION_REVOKE = "revoke"
    ACTION_LOGOUT = "logout"
    ACTION_TIMEOUT = "timeout"
    ACTION_IP_CHANGE = "ip_change"
    ACTION_DEVICE_MISMATCH = "device_mismatch"
    ACTION_CONCURRENT_LOGIN = "concurrent_login"
    ACTION_SECURITY_ALERT = "security_alert"
    
    # Revocation reasons
    REASON_USER_LOGOUT = "user_logout"
    REASON_ADMIN_REVOKE = "admin_revoke"
    REASON_SECURITY_BREACH = "security_breach"
    REASON_PASSWORD_CHANGE = "password_change"
    REASON_ROLE_CHANGE = "role_change"
    REASON_INACTIVITY = "inactivity"
    REASON_IP_MISMATCH = "ip_mismatch"
    REASON_DEVICE_MISMATCH = "device_mismatch"
    REASON_CONCURRENT_LOGIN = "concurrent_login"


def get_token_expiry_delta(token_type: str) -> timedelta:
    """Get expiration delta for a token type"""
    if token_type == SessionConstants.TOKEN_TYPE_ACCESS:
        return timedelta(minutes=SessionConfig.ACCESS_TOKEN_EXPIRE_MINUTES)
    elif token_type == SessionConstants.TOKEN_TYPE_REFRESH:
        return timedelta(days=SessionConfig.REFRESH_TOKEN_EXPIRE_DAYS)
    else:
        raise ValueError(f"Unknown token type: {token_type}")
