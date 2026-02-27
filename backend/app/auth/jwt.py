# auth/jwt.py
import requests
from jose import jwt
from functools import lru_cache
from fastapi import HTTPException, status
import os
import logging

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
API_AUDIENCE = os.getenv("AUTH0_API_AUDIENCE")
ISSUER = os.getenv("AUTH0_ISSUER")

ALGORITHMS = ["RS256"]
logger = logging.getLogger(__name__)


@lru_cache()
def get_jwks():
    jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    response = requests.get(jwks_url, timeout=10)
    response.raise_for_status()
    return response.json()


def verify_token(token: str):
    try:
        if not AUTH0_DOMAIN or not API_AUDIENCE or not ISSUER:
            logger.error(
                "Auth0 env not configured. AUTH0_DOMAIN=%s AUTH0_API_AUDIENCE=%s AUTH0_ISSUER=%s",
                bool(AUTH0_DOMAIN),
                bool(API_AUDIENCE),
                bool(ISSUER),
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Server Auth0 configuration missing",
            )

        jwks = get_jwks()
        unverified_header = jwt.get_unverified_header(token)

        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"],
                }

        if not rsa_key:
            raise HTTPException(status_code=401, detail="Invalid token header")

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=ISSUER,
        )

        return payload

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Token verification failed: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
