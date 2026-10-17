"""Verifies Clerk session tokens so the backend knows who is really calling.

Setup (backend .env file, next to main.py, never committed):
    CLERK_ISSUER=https://your-app.clerk.accounts.dev
    ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174   # optional

CLERK_ISSUER is your "Frontend API URL" on the Clerk Dashboard > API keys page.
"""
import os

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

load_dotenv()

CLERK_ISSUER = os.environ["CLERK_ISSUER"].rstrip("/")

# Clerk puts the origin that requested the token in the "azp" claim.
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174"
    ).split(",")
    if origin.strip()
}

# Downloads Clerk's public keys once and caches them.
_jwks_client = PyJWKClient(f"{CLERK_ISSUER}/.well-known/jwks.json")

# Gives the /docs page an "Authorize" button and reads the Authorization header.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    """FastAPI dependency: returns the verified Clerk user ID (e.g. "user_abc123")."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = credentials.credentials

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            leeway=10,  # tolerate small clock differences (exp and nbf are checked)
            options={"verify_aud": False, "require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    azp = claims.get("azp")
    if azp and azp not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=401, detail="Token not issued for this app")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token has no user")
    return user_id
