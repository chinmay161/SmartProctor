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

    # Prefer roles from token claims.
    roles = []
    roles.extend(_normalize_roles(payload.get(ROLE_NAMESPACE, [])))
    roles.extend(_normalize_roles(payload.get("roles", [])))
    roles.extend(_normalize_roles(payload.get("role", [])))

    # Merge locally mirrored profile role as an additional source of truth.
    sub = payload["sub"]
    email = payload.get("email")
    local_role = _load_local_role(sub, email)
    if local_role:
        roles.append(local_role)
    roles.extend(_load_auth0_roles(sub))
    if not roles:
        default_role = _ensure_default_student_role(sub, email)
        if default_role:
            roles.append(default_role)

    roles = list(dict.fromkeys(roles))

    return {
        "sub": sub,
        "email": email,
        "roles": roles,
    }
