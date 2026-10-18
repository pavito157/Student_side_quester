"""Authenticated quest reads and GPS completion for user-owned sidequests.

Legacy global records remain readable during the storage transition.
"""

import asyncio
import os
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field

from backend.quests.quest_completion import ASSIGNMENTS, CompletionError, abandon_quest, complete_quest
from backend.quests.quest_validation import valid_coordinates, valid_number
from backend.auth.firebase_helpers import current_uid, get_db
from backend.quests.quest_persistence import sidequests
from backend.quests.photo_proof import (
    MAX_PHOTO_BYTES, evaluate_photo, get_photo_proof_step, proof_response,
    record_skipped_photo_step, record_verified_photo_step, validate_image,
)

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
    latitude: Optional[float] = Field(..., strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: Optional[float] = Field(..., strict=True, ge=-180, le=180, allow_inf_nan=False)
    accuracy: Optional[float] = Field(..., strict=True, gt=0, allow_inf_nan=False)
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


@router.post("/quests/{quest_id}/steps/{step_index}/photo-proof")
async def submit_photo_proof(
    quest_id: str,
    request: Request,
    step_index: int = Path(ge=0, le=9),
    uid: str = Depends(current_uid),
    db=Depends(get_db),
):
    mime_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Use a JPEG, PNG, or WebP image.")
    chunks = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Images must be 5 MB or smaller.")
        chunks.append(chunk)
    image = b"".join(chunks)
    validate_image(image, mime_type)
    step_text = get_photo_proof_step(db, uid, quest_id, step_index)
    review = await asyncio.to_thread(evaluate_photo, step_text, image, mime_type)
    if not review.accepted:
        return proof_response(review)
    verified_steps = record_verified_photo_step(db, uid, quest_id, step_index)
    return {**proof_response(review), "verifiedPhotoSteps": verified_steps}


@router.post("/quests/{quest_id}/steps/{step_index}/skip-photo-proof")
def skip_photo_proof(
    quest_id: str,
    step_index: int = Path(ge=0, le=9),
    uid: str = Depends(current_uid),
    db=Depends(get_db),
):
    skipped_steps = record_skipped_photo_step(db, uid, quest_id, step_index)
    return {"skippedPhotoSteps": skipped_steps, "xpAwarded": 0}


@router.post("/quests/{quest_id}/abandon")
def abandon(
    quest_id: str, uid: str = Depends(current_uid), db=Depends(get_db),
):
    try:
        return abandon_quest(db, uid, quest_id)
    except CompletionError as error:
        raise HTTPException(error.status_code, error.detail) from error
