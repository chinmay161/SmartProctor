# auth/dependencies.py
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .jwt import verify_token
from .auth0_management import get_management_token
from ..database import SessionLocal
from ..models.user_profile import UserProfile
from typing import Optional
from urllib.parse import quote
import os
import requests

security = HTTPBearer()

ROLE_NAMESPACE = "https://smartproctor.io/roles"
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
SUPPORTED_ROLES = {"student", "teacher", "admin"}
ROLE_ALIASES = {
    "instructor": "teacher",
    "proctor": "teacher",
}


def canonicalize_role(role: str) -> str:
    normalized = str(role).strip().lower()
    return ROLE_ALIASES.get(normalized, normalized)


def _normalize_roles(raw_roles):
    if isinstance(raw_roles, str):
        raw_roles = [raw_roles]
    if not isinstance(raw_roles, list):
        return []
    return [canonicalize_role(r) for r in raw_roles if str(r).strip()]


def _has_supported_role(roles: list[str]) -> bool:
    return any(role in SUPPORTED_ROLES for role in roles)


def _first_supported_role(roles: list[str]) -> Optional[str]:
    for role in roles:
        if role in SUPPORTED_ROLES:
            return role
    return None


ROLE_HIERARCHY = ["admin", "teacher", "student"]


def resolve_highest_role(roles: list[str]) -> str:
    normalized = [canonicalize_role(r) for r in roles if str(r).strip()]
    for role in ROLE_HIERARCHY:
        if role in normalized:
            return role
    return "student"


def sync_user_profile_role(sub: str, roles: list[str], email: Optional[str] = None) -> str:
    highest = resolve_highest_role(roles)
    _upsert_local_profile_role(sub, email, highest)
    return highest


def _load_local_role(sub: str, email: Optional[str]):
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter_by(auth0_sub=sub).first()
        if not profile and email:
            # Legacy bootstrap scripts may have created profile rows keyed by email only.
            profile = db.query(UserProfile).filter_by(email=email).first()
            if profile and not profile.auth0_sub:
                profile.auth0_sub = sub
                db.add(profile)
                db.commit()

        if profile and profile.role:
            return canonicalize_role(profile.role)
        return None
    finally:
        db.close()


def _upsert_local_profile_role(sub: str, email: Optional[str], role: Optional[str] = None):
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter_by(auth0_sub=sub).first()
        if not profile and email:
            profile = db.query(UserProfile).filter_by(email=email).first()
            if profile and not profile.auth0_sub:
                profile.auth0_sub = sub

        changed = False
        if profile:
            if email and profile.email != email:
                profile.email = email
                changed = True
            if role:
                canonical_role = canonicalize_role(role)
                if profile.role != canonical_role:
                    profile.role = canonical_role
                    changed = True
            if changed:
                db.add(profile)
                db.commit()
            return

        db.add(
            UserProfile(
                auth0_sub=sub,
                email=email,
                role=canonicalize_role(role) if role else None,
            )
        )
        db.commit()
    finally:
        db.close()


def _load_auth0_roles(sub: str):
    if not AUTH0_DOMAIN:
        return []

    try:
        mgmt_token = get_management_token()
        encoded_sub = quote(sub, safe="")
        resp = requests.get(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_sub}/roles",
            headers={"Authorization": f"Bearer {mgmt_token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        auth0_roles = [item.get("name") for item in (resp.json() or [])]
        return _normalize_roles(auth0_roles)
    except Exception:
        return []


def _ensure_default_student_role(sub: str, email: Optional[str]):
    if not AUTH0_DOMAIN:
        return None

    try:
        mgmt_token = get_management_token()
        encoded_sub = quote(sub, safe="")
        headers = {"Authorization": f"Bearer {mgmt_token}", "Content-Type": "application/json"}

        # Re-check Auth0 roles directly before assigning defaults.
        roles_resp = requests.get(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_sub}/roles",
            headers=headers,
            timeout=10,
        )
        if roles_resp.status_code != 200:
            return None

        existing_roles = _normalize_roles([item.get("name") for item in (roles_resp.json() or [])])
        if existing_roles:
            return existing_roles[0]

        roles_catalog_resp = requests.get(
            f"https://{AUTH0_DOMAIN}/api/v2/roles",
            headers=headers,
            params={"per_page": 100},
            timeout=10,
        )
        if roles_catalog_resp.status_code != 200:
            return None

        student_role_id = None
        for role_info in (roles_catalog_resp.json() or []):
            if canonicalize_role(role_info.get("name")) == "student":
                student_role_id = role_info.get("id")
                break

        if not student_role_id:
            create_role_resp = requests.post(
                f"https://{AUTH0_DOMAIN}/api/v2/roles",
                headers=headers,
                json={"name": "student", "description": "Default student role"},
                timeout=10,
            )
            if create_role_resp.status_code in (200, 201):
                student_role_id = (create_role_resp.json() or {}).get("id")
            elif create_role_resp.status_code == 409:
                retry_roles_resp = requests.get(
                    f"https://{AUTH0_DOMAIN}/api/v2/roles",
                    headers=headers,
                    params={"per_page": 100},
                    timeout=10,
                )
                if retry_roles_resp.status_code == 200:
                    for role_info in (retry_roles_resp.json() or []):
                        if canonicalize_role(role_info.get("name")) == "student":
                            student_role_id = role_info.get("id")
                            break
            if not student_role_id:
                return None

        assign_resp = requests.post(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_sub}/roles",
            headers=headers,
            json={"roles": [student_role_id]},
            timeout=10,
        )
        if assign_resp.status_code not in (200, 204):
            return None

        db = SessionLocal()
        try:
            profile = db.query(UserProfile).filter_by(auth0_sub=sub).first()
            if not profile and email:
                profile = db.query(UserProfile).filter_by(email=email).first()
                if profile and not profile.auth0_sub:
                    profile.auth0_sub = sub

            if profile:
                profile.role = "student"
                if email and not profile.email:
                    profile.email = email
                db.add(profile)
            else:
                db.add(UserProfile(auth0_sub=sub, role="student", email=email))
            db.commit()
        finally:
            db.close()

        return "student"
    except Exception:
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    payload = verify_token(token)

    sub = payload["sub"]
    email = payload.get("email")

    # Keep a local profile row in sync for metadata.
    _upsert_local_profile_role(sub, email)

    # 1. Token claims (highest precedence)
    token_roles = []
    token_roles.extend(_normalize_roles(payload.get(ROLE_NAMESPACE, [])))
    token_roles.extend(_normalize_roles(payload.get("roles", [])))
    token_roles.extend(_normalize_roles(payload.get("role", [])))
    token_supported_role = _first_supported_role(token_roles)

    if token_supported_role:
        _upsert_local_profile_role(sub, email, token_supported_role)
        roles = list(dict.fromkeys(token_roles))
        return {
            "sub": sub,
            "email": email,
            "roles": roles,
            "role_source": "token",
        }

    # 2. Local database row
    local_role = _load_local_role(sub, email)
    if local_role:
        return {
            "sub": sub,
            "email": email,
            "roles": [local_role],
            "role_source": "local",
        }

    # 3. Default student fallback
    default_role = _ensure_default_student_role(sub, email) or "student"
    _upsert_local_profile_role(sub, email, default_role)
    return {
        "sub": sub,
        "email": email,
        "roles": [default_role],
        "role_source": "default",
    }
