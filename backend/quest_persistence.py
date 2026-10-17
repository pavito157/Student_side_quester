"""One active generated assignment per user. No completion or XP writes.

Gemini/place resolution run outside transactions. The final transaction rechecks
current state and creates quest + assignment + user pointer together, or reuses
the winner of a concurrent request without leaving an orphan quest.
"""

from datetime import datetime, timezone
import os
import uuid

from fastapi import HTTPException
from firebase_admin import firestore
from google.api_core.exceptions import GoogleAPICallError, RetryError
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import Field, ValidationError

from .firebase_helpers import USERS
from .quest_completion import ASSIGNMENTS
from .quest_contracts import (
    AssignedQuest, AssignQuestResponse, ContractModel, GeneratedQuestResponse, SavedAssignment,
)
from .quest_generation import generate_preview
from .request_timing import record_timing


class AssignmentPolicy(ContractModel):
    xpReward: int = Field(default=25, strict=True, ge=0, le=2**53 - 1)
    radiusMeters: float = Field(default=100, strict=True, gt=0, allow_inf_nan=False)


def get_assignment_policy():
    try:
        return AssignmentPolicy(xpReward=int(os.environ.get("QUEST_XP_REWARD", "25")),
                                radiusMeters=float(os.environ.get("QUEST_RADIUS_METERS", "100")))
    except (ValueError, OverflowError):
        raise HTTPException(503, "Invalid QUEST_XP_REWARD or QUEST_RADIUS_METERS configuration") from None


def _valid_id(value):
    return isinstance(value, str) and 0 < len(value) <= 128 and "/" not in value


def _check_uid(uid):
    if not _valid_id(uid):
        raise HTTPException(401, "Invalid authenticated user ID")


def _stored_response(db, transaction, uid, snapshot):
    data = snapshot.to_dict()
    quest_id = data.get("questId")
    if (data.get("userId") != uid or not _valid_id(quest_id)
            or snapshot.id != f"{uid}_{quest_id}"):
        raise HTTPException(409, "Current assignment identity is inconsistent")
    quest_snapshot = db.collection("quests").document(quest_id).get(transaction=transaction)
    if not quest_snapshot.exists:
        raise HTTPException(409, "Current assignment destination is missing")
    quest = quest_snapshot.to_dict()
    if quest.get("ownerId") not in (None, uid):
        raise HTTPException(409, "Current assignment ownership is inconsistent")
    try:
        return AssignQuestResponse(
            quest=AssignedQuest.model_validate({
                **{key: quest[key] for key in AssignedQuest.model_fields if key in quest},
                "id": quest_snapshot.id,
            }),
            assignment=SavedAssignment.model_validate({
                **{key: data[key] for key in SavedAssignment.model_fields if key in data},
                "id": snapshot.id,
            }), reusedExisting=True,
        )
    except ValidationError:
        raise HTTPException(409, "Current assignment data is incomplete or invalid") from None


def _read_active(db, transaction, uid, user):
    """Fast pointer read; recover older assignments without inventing schema data."""
    pointer = user.get("activeQuestId")
    if pointer is not None:
        if not _valid_id(pointer):
            raise HTTPException(409, "Current assignment pointer is invalid")
        snapshot = db.collection(ASSIGNMENTS).document(f"{uid}_{pointer}").get(transaction=transaction)
        if snapshot.exists:
            data = snapshot.to_dict()
            if data.get("userId") != uid or data.get("questId") != pointer:
                raise HTTPException(409, "Current assignment pointer is inconsistent")
            if data.get("status") == "assigned":
                return _stored_response(db, transaction, uid, snapshot)
            if data.get("status") != "completed":
                raise HTTPException(409, "Current assignment state is invalid")

    # Legacy recovery / stale completed pointer. This uses the existing single-
    # field userId query, requiring no new composite index. Do not silently hide
    # duplicate active records or create an additional active assignment.
    active = []
    for snapshot in db.collection(ASSIGNMENTS).where(
        filter=FieldFilter("userId", "==", uid),
    ).stream(transaction=transaction, timeout=10):
        if snapshot.to_dict().get("status") == "assigned":
            active.append(snapshot)
            if len(active) > 1:
                raise HTTPException(409, "Multiple active assignments need reconciliation")
    return _stored_response(db, transaction, uid, active[0]) if active else None


def _run_transaction(db, callback, read_only=False):
    try:
        return firestore.transactional(callback)(db.transaction(read_only=read_only))
    except (GoogleAPICallError, RetryError, ValueError):
        raise HTTPException(503, "Assignment database temporarily unavailable. Retry safely.") from None


def get_current_assignment(db, uid):
    _check_uid(uid)

    def read(transaction):
        snapshot = db.collection(USERS).document(uid).get(transaction=transaction)
        if not snapshot.exists:
            raise HTTPException(409, "Sign in to initialize your user profile first")
        return _read_active(db, transaction, uid, snapshot.to_dict())

    return _run_transaction(db, read, read_only=True)


def save_verified_assignment(db, uid, preview, policy):
    """Persist server-verified content only. UID must come from the token."""
    _check_uid(uid)
    try:
        preview = GeneratedQuestResponse.model_validate(preview.model_dump())
    except (ValidationError, AttributeError):
        raise HTTPException(502, "Generated quest verification is inconsistent") from None
    if not preview.destinationVerified or preview.destination is None or not preview.filtersApplied:
        raise HTTPException(503, "Destination resolver is required before saving assignments")

    destination, proposed = preview.destination, preview.quest
    quest_id = uuid.uuid4().hex
    quest = AssignedQuest(
        id=quest_id, title=proposed.title, description=proposed.description, steps=proposed.steps,
        locationName=destination.locationName, placeId=destination.placeId,
        latitude=destination.latitude, longitude=destination.longitude,
        radiusMeters=policy.radiusMeters, xpReward=policy.xpReward, isActive=True,
        estimatedMinutes=proposed.estimatedMinutes, estimatedCostDollars=proposed.estimatedCostDollars,
    )
    # Backend-generated UTC, stored and returned identically; never browser time.
    assignment = SavedAssignment(id=f"{uid}_{quest_id}", userId=uid, questId=quest_id,
                                 status="assigned", assignedAt=datetime.now(timezone.utc))
    result = AssignQuestResponse(quest=quest, assignment=assignment, reusedExisting=False)
    user_ref = db.collection(USERS).document(uid)

    def commit(transaction):
        user_snapshot = user_ref.get(transaction=transaction)
        if not user_snapshot.exists:
            raise HTTPException(409, "User profile no longer exists")
        existing = _read_active(db, transaction, uid, user_snapshot.to_dict())
        if existing is not None:
            return existing
        # Reading the same user document serializes competing creators; all
        # reads precede writes. The losing callback reuses the committed winner.
        transaction.create(db.collection("quests").document(quest_id), {
            **quest.model_dump(exclude={"id"}), "ownerId": uid,
            "source": "gemini", "createdAt": firestore.SERVER_TIMESTAMP,
        })
        transaction.create(db.collection(ASSIGNMENTS).document(assignment.id),
                           assignment.model_dump(exclude={"id"}))
        transaction.update(user_ref, {"activeQuestId": quest_id})
        return result

    return _run_transaction(db, commit)


def assign_generated_quest(db, uid, preferences, resolver, timings=None):
    with record_timing(timings, "lookup"):
        existing = get_current_assignment(db, uid)
    if existing is not None:
        return existing
    if resolver is None:
        raise HTTPException(503, "Destination resolver is not connected; use /quests/generate for an unsaved preview")
    policy = get_assignment_policy()
    # External calls must never be retried inside a Firestore transaction.
    preview = generate_preview(preferences, resolver, timings=timings)
    with record_timing(timings, "save"):
        return save_verified_assignment(db, uid, preview, policy)
