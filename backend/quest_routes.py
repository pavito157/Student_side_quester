"""Authenticated quest reads and GPS completion for user-owned sidequests.

Legacy global records remain readable during the storage transition.
"""

import os
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field

from .quest_completion import ASSIGNMENTS, CompletionError, abandon_quest, complete_quest
from .quest_validation import valid_coordinates, valid_number
from .firebase_helpers import current_uid, get_db
from .quest_persistence import sidequests

router = APIRouter(tags=["Quests"])


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
    legacy = [document(s) for s in snapshots if s.to_dict().get("ownerId") in (None, uid)]
    saved = list(sidequests(db, uid).stream())
    saved_ids = {s.id for s in saved}
    legacy = [item for item in legacy if item["id"] not in saved_ids]
    owned = [document(s) for s in saved
             if s.to_dict().get("status") == "assigned" and s.to_dict().get("isActive") is True]
    by_id = {item["id"]: item for item in legacy + owned}
    return {"quests": list(by_id.values())}


@router.get("/quests/{quest_id}")
def get_quest(quest_id: str, uid: str = Depends(current_uid), db=Depends(get_db)):
    snapshot = sidequests(db, uid).document(quest_id).get()
    if snapshot.exists and snapshot.to_dict().get("status") != "assigned":
        raise HTTPException(404, "Active quest not found")
    if not snapshot.exists:
        snapshot = db.collection("quests").document(quest_id).get()
    if (not snapshot.exists or snapshot.to_dict().get("isActive") is not True
            or snapshot.to_dict().get("ownerId") not in (None, uid)):
        raise HTTPException(404, "Active quest not found")
    return document(snapshot)


@router.get("/me/quests")
def my_quests(
    status: Optional[Literal["assigned", "completed", "skipped"]] = None,
    uid: str = Depends(current_uid), db=Depends(get_db),
):
    snapshots = db.collection(ASSIGNMENTS).where(
        filter=FieldFilter("userId", "==", uid)
    ).stream()
    legacy = [document(s) for s in snapshots if s.to_dict().get("status") in ("assigned", "completed", "skipped")]
    owned = [{**document(s), "id": f"{uid}_{s.id}"} for s in sidequests(db, uid).stream()
             if s.to_dict().get("status") in ("assigned", "completed", "skipped")]
    by_id = {item["id"]: item for item in legacy + owned}
    return {"quests": [item for item in by_id.values() if status is None or item["status"] == status]}


class CompletionLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(..., strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(..., strict=True, ge=-180, le=180, allow_inf_nan=False)
    accuracy: float = Field(..., strict=True, gt=0, allow_inf_nan=False)
    stopIndex: int = Field(default=0, strict=True, ge=0, le=2)


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
            location.accuracy, max_accuracy, location.stopIndex,
        )
    except CompletionError as error:
        raise HTTPException(error.status_code, error.detail) from error


@router.post("/quests/{quest_id}/abandon")
def abandon(
    quest_id: str, uid: str = Depends(current_uid), db=Depends(get_db),
):
    try:
        return abandon_quest(db, uid, quest_id)
    except CompletionError as error:
        raise HTTPException(error.status_code, error.detail) from error
