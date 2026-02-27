from fastapi import APIRouter, Depends, HTTPException, status
from ..auth.dependencies import get_current_user, canonicalize_role
from ..auth.auth0_management import get_management_token
from ..database import SessionLocal
from ..models.user_profile import UserProfile
import os
import requests
from urllib.parse import quote

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")

router = APIRouter(prefix="/profile", tags=["Profile"])


def _auth0_user_path_segment(auth0_sub: str) -> str:
    # Auth0 user ids include "|" and must be URL-encoded in path segments.
    return quote(auth0_sub, safe="")


def _preferred_role(roles: list[str]) -> str | None:
    normalized = [canonicalize_role(r) for r in roles if r]
    unique = list(dict.fromkeys(normalized))
    if "admin" in unique:
        return "admin"
    if "teacher" in unique:
        return "teacher"
    if "student" in unique:
        return "student"
    return unique[0] if unique else None


def _ensure_role_id(mgmt_token: str, role_name: str):
    """Return Auth0 role id for a given role name; create role if not exists."""
    headers = {"Authorization": f"Bearer {mgmt_token}", "Content-Type": "application/json"}
    r = requests.get(f"https://{AUTH0_DOMAIN}/api/v2/roles", headers=headers, params={"per_page": 100})
    r.raise_for_status()
    roles = r.json()
    for rinfo in roles:
        if rinfo.get("name") == role_name:
            return rinfo.get("id")

    cr = requests.post(
        f"https://{AUTH0_DOMAIN}/api/v2/roles",
        headers=headers,
        json={"name": role_name, "description": f"Role {role_name} created by app"},
    )
    cr.raise_for_status()
    created = cr.json()
    return created.get("id")


@router.post("/complete")
def complete_profile(data: dict, user=Depends(get_current_user)):
    """Assign Auth0 RBAC role to the user, store institution in app_metadata, and mirror locally.

    Expects JSON: { "role": "student", "institution": "My University" }
    Teacher/admin roles are intentionally not self-assignable here.
    """
    auth0_sub = user.get("sub")
    if not auth0_sub:
        raise HTTPException(status_code=400, detail="Invalid user in token")

    role = data.get("role")
    institution = data.get("institution")
    email = data.get("email") or user.get("email")

    # Self-service profile completion is only for student onboarding.
    if role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only student role can be self-assigned. Ask an admin for teacher access.",
        )

    mgmt_token = get_management_token()
    headers = {"Authorization": f"Bearer {mgmt_token}", "Content-Type": "application/json"}

    try:
        role_id = _ensure_role_id(mgmt_token, role)
        encoded_sub = _auth0_user_path_segment(auth0_sub)
        assign_resp = requests.post(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_sub}/roles",
            headers=headers,
            json={"roles": [role_id]},
        )
        assign_resp.raise_for_status()
    except requests.HTTPError as e:
        detail = None
        try:
            detail = e.response.json()
        except Exception:
            detail = e.response.text if e.response is not None else str(e)
        raise HTTPException(status_code=500, detail=f"Failed to assign role in Auth0: {detail}")

    try:
        encoded_sub = _auth0_user_path_segment(auth0_sub)
        patch_resp = requests.patch(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_sub}",
            headers=headers,
            json={"app_metadata": {"institution": institution}},
        )
        patch_resp.raise_for_status()
    except requests.HTTPError as e:
        detail = None
        try:
            detail = e.response.json()
        except Exception:
            detail = e.response.text if e.response is not None else str(e)
        raise HTTPException(status_code=500, detail=f"Failed to update Auth0 user metadata: {detail}")

    db = SessionLocal()
    try:
        existing = db.query(UserProfile).filter_by(auth0_sub=auth0_sub).first()
        if existing:
            existing.role = role
            existing.institution = institution
            existing.email = email or existing.email
            db.add(existing)
            db.commit()
        else:
            profile = UserProfile(auth0_sub=auth0_sub, role=role, institution=institution, email=email)
            db.add(profile)
            db.commit()
    finally:
        db.close()

    return {
        "auth0_sub": auth0_sub,
        "role": role,
        "institution": institution,
        "email": email,
    }


@router.get("/me")
def get_my_profile(user=Depends(get_current_user)):
    """Return profile with Auth0 roles prioritized over local mirror."""
    auth0_sub = user.get("sub")
    if not auth0_sub:
        raise HTTPException(status_code=400, detail="Invalid user in token")

    local_profile = None
    db = SessionLocal()
    try:
        local_profile = db.query(UserProfile).filter_by(auth0_sub=auth0_sub).first()
    finally:
        db.close()

    mgmt_token = get_management_token()
    headers = {"Authorization": f"Bearer {mgmt_token}", "Content-Type": "application/json"}
    encoded_sub = _auth0_user_path_segment(auth0_sub)

    roles_resp = requests.get(
        f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_sub}/roles",
        headers=headers,
    )
    auth0_roles = []
    if roles_resp.status_code == 200:
        auth0_roles = [
            canonicalize_role(r.get("name"))
            for r in (roles_resp.json() or [])
            if r.get("name")
        ]
    elif not local_profile:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch roles from Auth0: {roles_resp.status_code} {roles_resp.text}",
        )

    user_resp = requests.get(
        f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_sub}",
        headers=headers,
        params={"fields": "user_id,email,app_metadata", "include_fields": "true"},
    )
    if user_resp.status_code != 200 and not local_profile:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch user from Auth0: {user_resp.status_code} {user_resp.text}",
        )

    auth0_user = user_resp.json() if user_resp.status_code == 200 else {}
    local_role = canonicalize_role(local_profile.role) if local_profile and local_profile.role else None
    combined_roles = list(dict.fromkeys(auth0_roles + ([local_role] if local_role else [])))
    role_name = _preferred_role(combined_roles)

    if not role_name and not combined_roles:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    institution = (auth0_user.get("app_metadata") or {}).get("institution") or (local_profile.institution if local_profile else None)
    email = auth0_user.get("email") or (local_profile.email if local_profile else None)

    return {
        "auth0_sub": auth0_sub,
        "role": role_name,
        "roles": combined_roles,
        "institution": institution,
        "email": email,
    }
