"""Exchange a verified Clerk session for Firebase custom-token sign-in."""

import os
from functools import lru_cache
from typing import Optional
from urllib.parse import urlsplit

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from firebase_admin import auth, exceptions, firestore
from google.api_core.exceptions import GoogleAPICallError, RetryError
from google.auth.exceptions import GoogleAuthError
from pydantic import BaseModel, ConfigDict

from .firebase_helpers import USERS, bearer, current_uid, get_db, get_firebase_app, is_uf_email

router = APIRouter(prefix="/auth", tags=["Authentication"])


def frontend_origins():
    origins = [value.strip().rstrip("/") for value in os.environ.get(
        "FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",") if value.strip()]
    if not origins or any(value == "*" or urlsplit(value).scheme not in ("http", "https")
                          or not urlsplit(value).netloc for value in origins):
        raise ValueError("FRONTEND_ORIGINS must contain explicit HTTP(S) origins")
    return origins


def clerk_configuration():
    issuer = os.environ.get("CLERK_ISSUER", "").strip().rstrip("/")
    secret = os.environ.get("CLERK_SECRET_KEY", "").strip()
    parsed = urlsplit(issuer)
    if (not secret or parsed.scheme != "https" or not parsed.hostname
            or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise HTTPException(503, "Clerk authentication is not configured")
    return issuer, secret


@lru_cache(maxsize=4)
def clerk_signing_keys(issuer):
    return jwt.PyJWKClient(issuer + "/.well-known/jwks.json", timeout=5)


def verified_clerk_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    if credentials is None:
        raise HTTPException(401, "Clerk session token required", headers={"WWW-Authenticate": "Bearer"})
    issuer, secret = clerk_configuration()
    try:
        key = clerk_signing_keys(issuer).get_signing_key_from_jwt(credentials.credentials).key
        claims = jwt.decode(credentials.credentials, key, algorithms=["RS256"], issuer=issuer,
                            options={"require": ["exp", "iat", "nbf", "iss", "sub", "sid", "azp"],
                                     "verify_aud": False})
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(503, "Clerk authentication temporarily unavailable")
    except (jwt.InvalidTokenError, jwt.PyJWKClientError):
        raise HTTPException(401, "Invalid or expired Clerk session token")
    uid = claims["sub"]
    if (not isinstance(uid, str) or not uid.startswith("user_") or len(uid) > 128
            or "/" in uid or not isinstance(claims["sid"], str) or not claims["sid"]
            or claims["azp"] not in frontend_origins() or claims.get("sts", "active") != "active"):
        raise HTTPException(401, "Invalid Clerk session")

    # Email verification comes from Clerk's server API, never client JSON or
    # configurable session claims. The configured issuer pins the Clerk instance.
    try:
        result = httpx.get("https://api.clerk.com/v1/users/" + uid,
                           headers={"Authorization": "Bearer " + secret}, timeout=5)
        if result.status_code == 404:
            raise HTTPException(401, "Clerk account no longer exists")
        result.raise_for_status()
        user = result.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Clerk account lookup temporarily unavailable")
    if not isinstance(user, dict) or user.get("id") != uid:
        raise HTTPException(503, "Clerk account lookup returned an invalid account")
    if user.get("banned") is True or user.get("locked") is True:
        raise HTTPException(403, "This account is unavailable")
    addresses = user.get("email_addresses", [])
    if not isinstance(addresses, list):
        raise HTTPException(503, "Clerk account lookup returned invalid email data")
    primary = next((email for email in addresses if isinstance(email, dict)
                    and email.get("id") == user.get("primary_email_address_id")), {})
    verification = primary.get("verification")
    if (not isinstance(verification, dict) or verification.get("status") != "verified"
            or not is_uf_email(primary.get("email_address"))):
        raise HTTPException(403, "Use a verified primary @ufl.edu email in your Clerk account")
    email = primary["email_address"].lower()
    display_name = " ".join(part for part in (user.get("first_name"), user.get("last_name"))
                            if isinstance(part, str) and part.strip()).strip() or email.split("@")[0]
    return {"uid": uid, "email": email, "displayName": display_name}


def synchronize_firebase_user(identity):
    """Use the Clerk UID verbatim; never auto-link a different UID by email."""
    uid, email = identity["uid"], identity["email"]
    try:
        user = auth.get_user(uid)
    except auth.UserNotFoundError:
        try:
            return auth.create_user(uid=uid, email=email, email_verified=True,
                                    display_name=identity["displayName"])
        except auth.UidAlreadyExistsError:
            user = auth.get_user(uid)  # Another bridge request created it first.
    if user.disabled:
        raise HTTPException(403, "This Firebase account is disabled")
    if user.email != email or user.email_verified is not True:
        return auth.update_user(uid, email=email, email_verified=True)
    return user


def ensure_profile(db, identity):
    """Fill absent setup fields without resetting preferences, dorm, or XP."""
    reference = db.collection(USERS).document(identity["uid"])

    @firestore.transactional
    def initialize(transaction):
        snapshot = reference.get(transaction=transaction)
        existing = snapshot.to_dict() if snapshot.exists else {}
        defaults = {"displayName": identity["displayName"], "totalXp": 0,
                    "createdAt": firestore.SERVER_TIMESTAMP}
        missing = {key: value for key, value in defaults.items() if key not in existing}
        if missing:
            transaction.set(reference, missing, merge=True)

    initialize(db.transaction())


class BridgeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BridgeResponse(BaseModel):
    uid: str
    firebaseCustomToken: str


@router.post("/firebase", response_model=BridgeResponse)
def firebase_sign_in(payload: BridgeRequest, response: Response,
                     identity=Depends(verified_clerk_user)):
    # No identity, verified-email, or profile fields are accepted from the browser.
    try:
        get_firebase_app()
        synchronize_firebase_user(identity)
        ensure_profile(get_db(), identity)
        token = auth.create_custom_token(identity["uid"])
    except auth.EmailAlreadyExistsError:
        raise HTTPException(409, "Email is linked to another Firebase UID; account linking is required")
    except (exceptions.FirebaseError, GoogleAPICallError, RetryError, GoogleAuthError, ValueError, OSError):
        raise HTTPException(503, "Firebase authentication temporarily unavailable")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return {"uid": identity["uid"], "firebaseCustomToken": token.decode("utf-8")}


@router.get("/me")
def my_identity(uid: str = Depends(current_uid)):
    return {"uid": uid}
