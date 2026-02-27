"""
Session Utility Functions
Common utilities for session management operations
"""
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from ..models.user_session import UserSession, SessionAuditLog
from ..config.session_config import SessionConstants, SessionConfig
import hashlib
import re


class SessionUtils:
    """Utility class for session operations"""
    
    @staticmethod
    def is_session_active(db_session: UserSession) -> bool:
        """Check if a session is currently active"""
        if db_session.status != "ACTIVE":
            return False
        
        now = datetime.utcnow()
        if db_session.access_token_expires_at < now:
            return False
        
        return True
    
    @staticmethod
    def get_session_age_seconds(db_session: UserSession) -> int:
        """Get age of session in seconds"""
        return int((datetime.utcnow() - db_session.created_at).total_seconds())
    
    @staticmethod
    def get_session_inactivity_seconds(db_session: UserSession) -> int:
        """Get inactivity duration in seconds"""
        return int((datetime.utcnow() - db_session.last_activity_at).total_seconds())
    
    @staticmethod
    def get_inactivity_remaining_seconds(db_session: UserSession) -> int:
        """Get seconds remaining before inactivity timeout"""
        inactivity_limit = SessionConfig.INACTIVITY_TIMEOUT_MINUTES * 60
        remaining = inactivity_limit - SessionUtils.get_session_inactivity_seconds(db_session)
        return max(0, remaining)
    
    @staticmethod
    def get_token_remaining_seconds(db_session: UserSession, token_type: str = "access") -> int:
        """Get seconds remaining before token expiration"""
        if token_type == "access":
            expires = db_session.access_token_expires_at
        elif token_type == "refresh":
            expires = db_session.refresh_token_expires_at
        else:
            raise ValueError(f"Unknown token type: {token_type}")
        
        remaining = int((expires - datetime.utcnow()).total_seconds())
        return max(0, remaining)
    
    @staticmethod
    def should_warn_about_expiration(db_session: UserSession, token_type: str = "access") -> bool:
        """Check if client should warn user about token expiration soon"""
        remaining = SessionUtils.get_token_remaining_seconds(db_session, token_type)
        
        if token_type == "access":
            # Warn if less than 2 minutes remaining
            return remaining < 120
        elif token_type == "refresh":
            # Warn if less than 1 day remaining
            return remaining < 86400
        
        return False
    
    @staticmethod
    def format_session_duration(seconds: int) -> str:
        """Format duration in seconds to human-readable string"""
        if seconds < 60:
            return f"{seconds}s"
        elif seconds < 3600:
            minutes = seconds // 60
            secs = seconds % 60
            return f"{minutes}m {secs}s"
        elif seconds < 86400:
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            return f"{hours}h {minutes}m"
        else:
            days = seconds // 86400
            hours = (seconds % 86400) // 3600
            return f"{days}d {hours}h"
    
    @staticmethod
    def get_session_summary(db_session: UserSession) -> Dict[str, Any]:
        """Get a summary of session details"""
        return {
            "session_id": db_session.id,
            "user_id": db_session.user_id,
            "status": db_session.status,
            "created_at": db_session.created_at.isoformat(),
            "expires_at": db_session.expires_at.isoformat(),
            "last_activity": db_session.last_activity_at.isoformat(),
            "age": SessionUtils.format_session_duration(SessionUtils.get_session_age_seconds(db_session)),
            "inactivity": SessionUtils.format_session_duration(SessionUtils.get_session_inactivity_seconds(db_session)),
            "access_token_expires_in": SessionUtils.format_session_duration(SessionUtils.get_token_remaining_seconds(db_session, "access")),
            "is_mobile": db_session.is_mobile,
            "is_trusted_device": db_session.is_trusted_device,
            "refresh_count": db_session.refresh_count,
            "ip_address": db_session.ip_address,
        }
    
    @staticmethod
    def get_user_session_summary(db: Session, user_id: str) -> Dict[str, Any]:
        """Get summary of all sessions for a user"""
        sessions = db.query(UserSession).filter(
            UserSession.user_id == user_id
        ).all()
        
        active_count = sum(1 for s in sessions if SessionUtils.is_session_active(s))
        
        return {
            "user_id": user_id,
            "total_sessions": len(sessions),
            "active_sessions": active_count,
            "sessions": [SessionUtils.get_session_summary(s) for s in sessions],
        }


class DeviceFingerprintUtils:
    """Utilities for device fingerprinting"""
    
    @staticmethod
    def generate_fingerprint(
        user_agent: str,
        ip_address: Optional[str],
        accept_language: Optional[str] = None,
        accept_encoding: Optional[str] = None,
    ) -> str:
        """
        Generate a device fingerprint from client characteristics
        
        This is used to detect if a session is being used from a different device.
        More sophisticated implementations might include:
        - Canvas fingerprinting (browser rendering)
        - WebGL info
        - Screen resolution
        - Timezone
        - Fonts available
        - Browser plugins
        """
        fingerprint_components = [
            user_agent or "",
            ip_address or "",
            accept_language or "",
            accept_encoding or "",
        ]
        
        fingerprint_string = "|".join(fingerprint_components)
        return hashlib.sha256(fingerprint_string.encode()).hexdigest()
    
    @staticmethod
    def fingerprints_match(
        fp1: str,
        fp2: str,
        tolerance: float = 0.0,
    ) -> bool:
        """
        Check if two fingerprints match (with optional tolerance)
        
        Args:
            fp1: First fingerprint
            fp2: Second fingerprint
            tolerance: Tolerance level (0.0 = exact match, 1.0 = always match)
        
        Returns:
            True if fingerprints match within tolerance
        """
        if tolerance >= 1.0:
            return True
        
        return fp1 == fp2


class IPAddressUtils:
    """Utilities for IP address validation and tracking"""
    
    @staticmethod
    def is_valid_ipv4(ip: str) -> bool:
        """Validate IPv4 address"""
        ipv4_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
        if not re.match(ipv4_pattern, ip):
            return False
        
        parts = ip.split('.')
        for part in parts:
            num = int(part)
            if num < 0 or num > 255:
                return False
        
        return True
    
    @staticmethod
    def is_valid_ipv6(ip: str) -> bool:
        """Validate IPv6 address"""
        # Simplified validation - could be more robust
        if ':' not in ip:
            return False
        
        parts = ip.split(':')
        return 3 <= len(parts) <= 8
    
    @staticmethod
    def is_private_ip(ip: Optional[str]) -> bool:
        """Check if IP is in private range"""
        if not ip:
            return False
        
        private_ranges = [
            ("10.0.0.0", "10.255.255.255"),
            ("172.16.0.0", "172.31.255.255"),
            ("192.168.0.0", "192.168.255.255"),
            ("127.0.0.0", "127.255.255.255"),
        ]
        
        if not IPAddressUtils.is_valid_ipv4(ip):
            return False
        
        ip_parts = [int(part) for part in ip.split('.')]
        ip_int = (ip_parts[0] << 24) + (ip_parts[1] << 16) + (ip_parts[2] << 8) + ip_parts[3]
        
        for start, end in private_ranges:
            start_parts = [int(part) for part in start.split('.')]
            start_int = (start_parts[0] << 24) + (start_parts[1] << 16) + (start_parts[2] << 8) + start_parts[3]
            
            end_parts = [int(part) for part in end.split('.')]
            end_int = (end_parts[0] << 24) + (end_parts[1] << 16) + (end_parts[2] << 8) + end_parts[3]
            
            if start_int <= ip_int <= end_int:
                return True
        
        return False
    
    @staticmethod
    def get_ip_location_mismatch_score(
        ip1: str,
        ip2: str,
        location1: Optional[str] = None,
        location2: Optional[str] = None,
    ) -> float:
        """
        Calculate a score indicating how different two IPs are
        
        0.0 = same IP
        1.0 = completely different
        
        In production, would use GeoIP database to calculate
        geographic distance between IPs.
        """
        if ip1 == ip2:
            return 0.0
        
        # Simple version: same subnet = 0.3, different = 1.0
        ip1_subnet = ".".join(ip1.split(".")[:3])
        ip2_subnet = ".".join(ip2.split(".")[:3])
        
        if ip1_subnet == ip2_subnet:
            return 0.3
        
        return 1.0


class UserAgentUtils:
    """Utilities for parsing and matching user agents"""
    
    @staticmethod
    def extract_browser_info(user_agent: str) -> Dict[str, str]:
        """Extract browser information from user agent string"""
        info = {
            "browser": "Unknown",
            "version": "Unknown",
            "os": "Unknown",
            "device_type": "Desktop",
        }
        
        if not user_agent:
            return info
        
        # Browser detection
        if "Firefox" in user_agent:
            info["browser"] = "Firefox"
            info["device_type"] = "Mobile" if "Mobile" in user_agent else "Desktop"
        elif "Chrome" in user_agent:
            info["browser"] = "Chrome"
            info["device_type"] = "Mobile" if "Mobile" in user_agent else "Desktop"
        elif "Safari" in user_agent:
            info["browser"] = "Safari"
            info["device_type"] = "Mobile" if "iPhone" in user_agent or "iPad" in user_agent else "Desktop"
        elif "Edge" in user_agent:
            info["browser"] = "Edge"
            info["device_type"] = "Desktop"
        
        # OS detection
        if "Windows" in user_agent:
            info["os"] = "Windows"
        elif "Macintosh" in user_agent:
            info["os"] = "macOS"
        elif "Android" in user_agent:
            info["os"] = "Android"
        elif "iPhone" in user_agent or "iPad" in user_agent:
            info["os"] = "iOS"
        elif "Linux" in user_agent:
            info["os"] = "Linux"
        
        return info
    
    @staticmethod
    def user_agents_compatible(ua1: str, ua2: str, tolerance: float = 0.8) -> bool:
        """
        Check if two user agents are from the same device/browser
        
        Args:
            ua1: First user agent string
            ua2: Second user agent string
            tolerance: Similarity threshold (0.0 = exact match, 1.0 = always match)
        
        Returns:
            True if user agents are compatible
        """
        if tolerance >= 1.0:
            return True
        
        if tolerance >= 0.9:
            # Same browser
            return UserAgentUtils.extract_browser_info(ua1)["browser"] == \
                   UserAgentUtils.extract_browser_info(ua2)["browser"]
        
        # Exact match
        return ua1 == ua2
