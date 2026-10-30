# auth/roles.py
import logging
from fastapi import Depends, HTTPException, status
from .dependencies import canonicalize_role, get_current_user

logger = logging.getLogger(__name__)


def deny_access(user: dict, required_roles: list[str]) -> None:
    user_sub = user.get("sub") if isinstance(user, dict) else "unknown"
    user_roles = [canonicalize_role(r) for r in (user.get("roles") or [])] if isinstance(user, dict) else []
    detected_roles = sorted(list(dict.fromkeys(user_roles)))
    req_roles = sorted(list(dict.fromkeys(canonicalize_role(r) for r in required_roles if r)))
    role_source = user.get("role_source", "unknown") if isinstance(user, dict) else "unknown"

    logger.warning(
        "Access denied: user_sub=%s, required_roles=%s, detected_roles=%s, role_source=%s",
        user_sub,
        req_roles,
        detected_roles,
        role_source,
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Insufficient permissions. Required: {req_roles}, detected: {detected_roles}",
    )


def require_role(required_role: str | list[str]):
    req_list = [required_role] if isinstance(required_role, str) else list(required_role)
    normalized_required = {canonicalize_role(r) for r in req_list if r}

    def role_checker(user=Depends(get_current_user)):
        normalized_user_roles = {
            canonicalize_role(role)
            for role in (user.get("roles") or [])
        }
        if not normalized_required.intersection(normalized_user_roles):
            deny_access(user, list(normalized_required))
        return user

    return role_checker


def require_teacher_or_admin(user=Depends(get_current_user)):
    """Allows teachers, admins, and school admins."""
    required = ["teacher", "admin", "school_admin"]
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    if not roles.intersection(required):
        deny_access(user, required)
    return user
