# auth/roles_service.py
import requests
import os
from .auth0_management import get_management_token
from urllib.parse import quote

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")


def _auth0_user_path_segment(user_id: str) -> str:
    return quote(user_id, safe="")


def get_role_id(role_name: str) -> str:
    token = get_management_token()
    url = f"https://{AUTH0_DOMAIN}/api/v2/roles"

    headers = {"Authorization": f"Bearer {token}"}
    roles = requests.get(url, headers=headers).json()

    for role in roles:
        if role["name"] == role_name:
            return role["id"]

    raise ValueError("Role not found")

def get_user_roles(user_id: str):
    token = get_management_token()
    encoded_user_id = _auth0_user_path_segment(user_id)
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}/roles"

    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(url, headers=headers)
    r.raise_for_status()

    return r.json()


def get_user_role_names(user_id: str):
    return [r.get("name") for r in get_user_roles(user_id) if r.get("name")]


def add_roles_to_user(user_id: str, role_names: list[str]):
    normalized = [r for r in dict.fromkeys(role_names) if r]
    if not normalized:
        return

    token = get_management_token()
    role_ids = [get_role_id(r) for r in normalized]
    encoded_user_id = _auth0_user_path_segment(user_id)
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}/roles"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {"roles": role_ids}
    r = requests.post(url, json=payload, headers=headers)
    r.raise_for_status()


def remove_roles_from_user(user_id: str, role_names: list[str]):
    normalized = [r for r in dict.fromkeys(role_names) if r]
    if not normalized:
        return

    token = get_management_token()
    role_ids = [get_role_id(r) for r in normalized]
    encoded_user_id = _auth0_user_path_segment(user_id)
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}/roles"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {"roles": role_ids}
    r = requests.delete(url, json=payload, headers=headers)
    r.raise_for_status()

def remove_all_roles(user_id: str):
    token = get_management_token()
    roles = get_user_roles(user_id)

    if not roles:
        return

    role_ids = [r["id"] for r in roles]

    encoded_user_id = _auth0_user_path_segment(user_id)
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}/roles"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    payload = {"roles": role_ids}
    r = requests.delete(url, json=payload, headers=headers)
    r.raise_for_status()
