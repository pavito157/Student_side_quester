"""Shared Firebase initialization, database client, and verified identity."""

from functools import lru_cache
from typing import Optional

import firebase_admin
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, firestore

USERS = "Users"
bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        return firebase_admin.initialize_app()


@lru_cache
def get_db():
    return firestore.client(app=get_firebase_app())


def is_valid_email(email):
    """Accept all email domains; callers must still require provider verification."""
    return (isinstance(email, str) and email.count("@") == 1
            and all(email.split("@")) and not any(c.isspace() for c in email))


def current_uid(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if credentials is None:
        raise HTTPException(401, "Firebase ID token required", headers={"WWW-Authenticate": "Bearer"})
    get_firebase_app()
    try:
        claims = auth.verify_id_token(credentials.credentials, check_revoked=True)
    except (auth.InvalidIdTokenError, auth.RevokedIdTokenError, auth.UserDisabledError, ValueError):
        raise HTTPException(401, "Invalid or expired ID token", headers={"WWW-Authenticate": "Bearer"})
    except auth.CertificateFetchError:
        raise HTTPException(503, "Authentication temporarily unavailable")
    if not is_valid_email(claims.get("email")) or claims.get("email_verified") is not True:
        raise HTTPException(403, "A verified email account is required")
    uid = claims.get("uid")
    if not isinstance(uid, str) or not uid or "/" in uid or len(uid) > 128:
        raise HTTPException(401, "Invalid ID token")
    return uid
