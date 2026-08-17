from fastapi import WebSocket, WebSocketException
from .jwt import verify_token
from .dependencies import canonicalize_role, _ensure_default_student_role, _load_auth0_roles, _load_local_role

ROLE_NAMESPACE = "https://smartproctor.io/roles"


def _normalize_roles(raw_roles):
    if isinstance(raw_roles, str):
        raw_roles = [raw_roles]
    if not isinstance(raw_roles, list):
        return []
    return [canonicalize_role(role) for role in raw_roles if str(role).strip()]


async def authenticate_websocket(ws: WebSocket):
    token = ws.query_params.get("token")

    if not token:
        raise WebSocketException(code=4401, reason="Missing token")

    payload = verify_token(token)
    roles = []
    roles.extend(_normalize_roles(payload.get(ROLE_NAMESPACE, [])))
    roles.extend(_normalize_roles(payload.get("roles", [])))
    roles.extend(_normalize_roles(payload.get("role", [])))
    for key, value in payload.items():
        if key != ROLE_NAMESPACE and str(key).endswith("/roles"):
            roles.extend(_normalize_roles(value))

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
