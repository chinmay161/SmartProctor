from jose import jwt
from fastapi import WebSocket, WebSocketException
from .jwt import verify_token
from .dependencies import canonicalize_role

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
    roles = list(dict.fromkeys(roles))

    return {
        "sub": payload["sub"],
        "email": payload.get("email"),
        "roles": roles,
    }
