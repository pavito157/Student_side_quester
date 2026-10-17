"""Supplied quest router plus completion; mount with app.include_router(router).

Uses the supplied camelCase schema. No app startup or credentials at import time.
The supplied snippet omitted POST /quests/assign; it is not recreated here.
"""

import os
from functools import lru_cache
from typing import Literal, Optional

import firebase_admin
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field

from .quest_completion import ASSIGNMENTS, CompletionError, complete_quest
from .quest_validation import valid_coordinates, valid_number

router = APIRouter(tags=["Quests"])
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
    email = claims.get("email")
    if (not isinstance(email, str) or claims.get("email_verified") is not True
            or email.lower().rsplit("@", 1)[-1] != "ufl.edu" or "@" not in email):
        raise HTTPException(403, "A verified @ufl.edu account is required")
    uid = claims.get("uid")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid ID token")
    return uid


def document(snapshot):
    return {**snapshot.to_dict(), "id": snapshot.id}


def assignable(data):
    return (
        data.get("isActive") is True
        and valid_coordinates(data.get("latitude"), data.get("longitude"))
        and valid_number(data.get("radiusMeters")) and data["radiusMeters"] > 0
        and type(data.get("xpReward")) is int and data["xpReward"] >= 0
    )


@router.get("/quests")
def list_quests(uid: str = Depends(current_uid), db=Depends(get_db)):
    snapshots = db.collection("quests").where(
        filter=FieldFilter("isActive", "==", True)
    ).stream()
    return {"quests": [document(s) for s in snapshots]}


@router.get("/quests/{quest_id}")
def get_quest(quest_id: str, uid: str = Depends(current_uid), db=Depends(get_db)):
    snapshot = db.collection("quests").document(quest_id).get()
    if not snapshot.exists or snapshot.to_dict().get("isActive") is not True:
        raise HTTPException(404, "Active quest not found")
    return document(snapshot)


@router.get("/me/quests")
def my_quests(
    status: Optional[Literal["assigned", "completed"]] = None,
    uid: str = Depends(current_uid), db=Depends(get_db),
):
    snapshots = db.collection(ASSIGNMENTS).where(
        filter=FieldFilter("userId", "==", uid)
    ).stream()
    return {"quests": [document(s) for s in snapshots
                       if status is None or s.to_dict().get("status") == status]}


class CompletionLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(..., strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(..., strict=True, ge=-180, le=180, allow_inf_nan=False)
    accuracy: float = Field(..., strict=True, gt=0, allow_inf_nan=False)


def get_max_accuracy():
    try:
        maximum = float(os.environ.get("MAX_LOCATION_ACCURACY_METERS", "50"))
    except ValueError:
        maximum = float("nan")
    if not valid_number(maximum) or maximum <= 0:
        raise HTTPException(500, "Invalid MAX_LOCATION_ACCURACY_METERS configuration")
    return maximum


@router.post("/quests/{quest_id}/complete")
def complete(
    quest_id: str, location: CompletionLocation,
    uid: str = Depends(current_uid), db=Depends(get_db),
    max_accuracy: float = Depends(get_max_accuracy),
):
    try:
        return complete_quest(
            db, uid, quest_id, location.latitude, location.longitude,
            location.accuracy, max_accuracy,
        )
    except CompletionError as error:
        raise HTTPException(error.status_code, error.detail) from error
