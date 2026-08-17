import requests, os
from .auth0_management import get_management_token
from .roles_service import get_role_id, remove_all_roles
from urllib.parse import quote

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")


def _auth0_user_path_segment(user_id: str) -> str:
    return quote(user_id, safe="")


def assign_role_to_user(user_id: str, role_name: str):
    token = get_management_token()
    role_id = get_role_id(role_name)

    encoded_user_id = _auth0_user_path_segment(user_id)
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}/roles"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    payload = {"roles": [role_id]}

    r = requests.post(url, json=payload, headers=headers)
    r.raise_for_status()

def replace_user_role(user_id: str, new_role: str):
    remove_all_roles(user_id)

    token = get_management_token()
    role_id = get_role_id(new_role)

    encoded_user_id = _auth0_user_path_segment(user_id)
    url = f"https://{AUTH0_DOMAIN}/api/v2/users/{encoded_user_id}/roles"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    payload = {"roles": [role_id]}
    r = requests.post(url, json=payload, headers=headers)
    r.raise_for_status()
