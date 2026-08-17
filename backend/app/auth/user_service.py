import requests
import os
from .auth0_management import get_management_token
from .dependencies import canonicalize_role
from .roles_service import get_user_role_names
from ..database import SessionLocal
from ..models.user_profile import UserProfile
from urllib.parse import quote

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")


def _build_auth0_query(email: str | None, status: str | None) -> str | None:
    query_parts = []
    if email:
        query_parts.append(f'email:"{email}"')
    if status == "active":
        query_parts.append("blocked:false")
    elif status == "suspended":
        query_parts.append("blocked:true")
    return " AND ".join(query_parts) if query_parts else None


def _auth0_list_users(token: str, page: int, per_page: int, query: str | None):
    params = {
        "q": query,
        "search_engine": "v3",
        "page": page,
        "per_page": per_page,
        "include_totals": "true",
    }
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(
        f"https://{AUTH0_DOMAIN}/api/v2/users",
        headers=headers,
        params=params,
    )
    r.raise_for_status()
    return r.json()


def _hydrate_user_rows(raw_users: list[dict]):
    user_ids = [u.get("user_id") for u in raw_users if u.get("user_id")]
    roles_by_user: dict[str, list[str]] = {}
    for user_id in user_ids:
        try:
            role_names = get_user_role_names(user_id)
            roles_by_user[user_id] = [canonicalize_role(r) for r in role_names if r]
        except Exception:
            roles_by_user[user_id] = []

    db = SessionLocal()
    local_profiles = {}
    try:
        profiles = db.query(UserProfile).filter(UserProfile.auth0_sub.in_(user_ids)).all() if user_ids else []
        local_profiles = {p.auth0_sub: p for p in profiles}
    finally:
        db.close()

    users = []
    for u in raw_users:
        user_id = u.get("user_id")
        roles = roles_by_user.get(user_id, [])
        local_profile = local_profiles.get(user_id)
        app_metadata = u.get("app_metadata") or {}
        institution = app_metadata.get("institution") or (local_profile.institution if local_profile else None)
        users.append(
            {
                "user_id": user_id,
                "email": u.get("email"),
                "name": u.get("name"),
                "created_at": u.get("created_at"),
                "roles": roles,
                "blocked": bool(u.get("blocked")),
                "email_verified": bool(u.get("email_verified")),
                "last_login": u.get("last_login"),
                "logins_count": u.get("logins_count"),
                "institution": institution,
            }
        )
    return users


def search_users_by_email(email: str):
    token = get_management_token()

    url = f"https://{AUTH0_DOMAIN}/api/v2/users"
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "q": f'email:"{email}"',
        "search_engine": "v3",
    }

    r = requests.get(url, headers=headers, params=params)
    r.raise_for_status()

    users = []
    for u in r.json():
        users.append({
            "user_id": u["user_id"],
            "email": u.get("email"),
            "name": u.get("name"),
            "created_at": u.get("created_at"),
        })

    return users

def search_users(
    email: str | None,
    page: int,
    page_size: int,
    role: str | None = None,
    status: str | None = None,
):
    token = get_management_token()
    role_filter = canonicalize_role(role) if role and role != "all" else "all"
    query = _build_auth0_query(email, status)

    # No role filtering: use Auth0 pagination directly.
    if role_filter == "all":
        data = _auth0_list_users(token, page - 1, page_size, query)
        users = _hydrate_user_rows(data.get("users", []))
        return users, data.get("total", len(users))

    # Role filtering: fetch all users matching base query, then paginate after role check.
    per_page = 50
    first_page = _auth0_list_users(token, 0, per_page, query)
    total_base = int(first_page.get("total", 0))
    raw_users = first_page.get("users", [])

    fetched = len(raw_users)
    next_page = 1
    while fetched < total_base:
        page_data = _auth0_list_users(token, next_page, per_page, query)
        batch = page_data.get("users", [])
        raw_users.extend(batch)
        fetched += len(batch)
        next_page += 1
        if not batch:
            break

    hydrated = _hydrate_user_rows(raw_users)
    filtered = [u for u in hydrated if role_filter in set(u.get("roles", []))]
    start_idx = max(0, (page - 1) * page_size)
    end_idx = start_idx + page_size
    return filtered[start_idx:end_idx], len(filtered)


def get_user_detail(user_id: str):
    token = get_management_token()
    encoded_user_id = quote(user_id, safe="")
    headers = {"Authorization": f"Bearer {token}"}
    fields = ",".join(
        [
            "user_id",
            "name",
            "email",
            "nickname",
            "picture",
            "created_at",
            "updated_at",
            "last_login",
            "logins_count",
            "blocked",
            "email_verified",
            "app_metadata",
            "user_metadata",
        ]
    )
    params = {"fields": fields, "include_fields": "true"}
    r = requests.get(
        f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}",
        headers=headers,
        params=params,
    )
    r.raise_for_status()
    user = r.json()

    roles = []
    try:
        roles = [canonicalize_role(role) for role in get_user_role_names(user_id)]
    except Exception:
        roles = []

    db = SessionLocal()
    profile = None
    try:
        profile = db.query(UserProfile).filter_by(auth0_sub=user_id).first()
    finally:
        db.close()

    return {
        "user_id": user.get("user_id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "nickname": user.get("nickname"),
        "picture": user.get("picture"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
        "last_login": user.get("last_login"),
        "logins_count": user.get("logins_count"),
        "blocked": bool(user.get("blocked")),
        "email_verified": bool(user.get("email_verified")),
        "roles": roles,
        "app_metadata": user.get("app_metadata") or {},
        "user_metadata": user.get("user_metadata") or {},
        "profile": (
            {
                "role": profile.role,
                "institution": profile.institution,
                "email": profile.email,
            }
            if profile
            else None
        ),
    }


def update_user_blocked(user_id: str, blocked: bool):
    token = get_management_token()
    encoded_user_id = quote(user_id, safe="")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    r = requests.patch(
        f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}",
        headers=headers,
        json={"blocked": bool(blocked)},
    )
    r.raise_for_status()
    return {"user_id": user_id, "blocked": bool(blocked), "status": "suspended" if blocked else "active"}
