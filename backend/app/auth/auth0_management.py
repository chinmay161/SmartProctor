# auth/auth0_management.py
import requests
import os
import time
from fastapi import HTTPException, status

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
CLIENT_ID = os.getenv("AUTH0_MGMT_CLIENT_ID")
CLIENT_SECRET = os.getenv("AUTH0_MGMT_CLIENT_SECRET")
AUDIENCE = os.getenv("AUTH0_MGMT_AUDIENCE")

_mgmt_token_cache = {"token": None, "expires_at": 0.0}


def _ensure_management_env():
    if not AUTH0_DOMAIN or not CLIENT_ID or not CLIENT_SECRET or not AUDIENCE:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth0 management configuration missing. Check AUTH0_DOMAIN, AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET, AUTH0_MGMT_AUDIENCE.",
        )


def _fetch_management_token():
    url = f"https://{AUTH0_DOMAIN}/oauth/token"

    payload = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "audience": AUDIENCE,
        "grant_type": "client_credentials",
    }

    try:
        r = requests.post(url, json=payload, timeout=10)
        r.raise_for_status()
    except requests.HTTPError:
        error = None
        description = None
        try:
            body = r.json()
            error = body.get("error")
            description = body.get("error_description")
        except Exception:
            pass

        message = (
            f"Failed to get Auth0 management token (status {r.status_code}). "
            "Verify AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET, AUTH0_MGMT_AUDIENCE, and Machine-to-Machine app authorization."
        )
        if error or description:
            message = f"{message} Auth0 response: {error or 'error'} - {description or 'no description'}."

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=message,
        )
    except requests.RequestException:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach Auth0 token endpoint for management API.",
        )

    data = r.json()
    token = data.get("access_token")
    expires_in = int(data.get("expires_in", 3600))
    if not token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth0 token endpoint did not return access_token.",
        )

    _mgmt_token_cache["token"] = token
    _mgmt_token_cache["expires_at"] = time.time() + max(60, expires_in - 60)
    return token


def get_management_token():
    _ensure_management_env()
    if _mgmt_token_cache["token"] and time.time() < _mgmt_token_cache["expires_at"]:
        return _mgmt_token_cache["token"]

    return _fetch_management_token()


def get_user(auth0_user_id: str):
    """Fetch a user from Auth0 Management API"""
    token = get_management_token()
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{auth0_user_id}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = requests.get(url, headers=headers)
    r.raise_for_status()
    return r.json()


def update_app_metadata(auth0_user_id: str, metadata: dict):
    """Update user's app_metadata via Management API (merges with existing)"""
    token = get_management_token()
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{auth0_user_id}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"app_metadata": metadata}
    r = requests.patch(url, json=body, headers=headers)
    r.raise_for_status()
    return r.json()
