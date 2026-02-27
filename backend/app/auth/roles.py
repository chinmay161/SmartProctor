# auth/roles.py
from fastapi import Depends, HTTPException, status
from .dependencies import canonicalize_role, get_current_user

def require_role(required_role: str):
    normalized_required_role = canonicalize_role(required_role)

    def role_checker(user=Depends(get_current_user)):
        normalized_user_roles = {
            canonicalize_role(role)
            for role in (user.get("roles") or [])
        }
        if normalized_required_role not in normalized_user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return role_checker
