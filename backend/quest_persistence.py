"""One active generated assignment per user. No XP awards during assignment creation.

Gemini/place resolution run outside transactions. The final transaction rechecks
current state and creates a user-scoped sidequest + user pointer together, or reuses
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
from typing import Optional

from .firebase_helpers import USERS
from .quest_completion import ASSIGNMENTS, abandon_quest
from .quest_contracts import (
    AssignedQuest, AssignQuestResponse, ContractModel, GenerateQuestRequest, GeneratedQuestResponse, SavedAssignment,
)
from .quest_generation import generate_preview
from .request_timing import record_timing
from .xp import quest_xp_reward


class AssignmentPolicy(ContractModel):
    radiusMeters: float = Field(default=100, strict=True, gt=0, allow_inf_nan=False)


def get_assignment_policy():
    try:
        return AssignmentPolicy(radiusMeters=float(os.environ.get("QUEST_RADIUS_METERS", "100")))
    except (ValueError, OverflowError):
        raise HTTPException(503, "Invalid QUEST_RADIUS_METERS configuration") from None


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


def sidequests(db, uid):
    return db.collection(USERS).document(uid).collection("sidequests")


def _nested_response(uid, snapshot):
    data = snapshot.to_dict()
    if (data.get("userId") != uid or data.get("questId") != snapshot.id
            or data.get("ownerId") != uid):
        raise HTTPException(409, "Current assignment identity is inconsistent")
    try:
        return AssignQuestResponse(
            quest=AssignedQuest.model_validate({
                **{key: data[key] for key in AssignedQuest.model_fields if key in data},
                "id": snapshot.id,
            }),
            assignment=SavedAssignment.model_validate({
                **{key: data[key] for key in SavedAssignment.model_fields if key in data},
                "id": f"{uid}_{snapshot.id}",
            }), reusedExisting=True,
        )
    except ValidationError:
        raise HTTPException(409, "Current assignment data is incomplete or invalid") from None


def _sidequest_data(result, user_request: Optional[GenerateQuestRequest] = None):
    data = {
        **result.quest.model_dump(exclude={"id"}),
        **result.assignment.model_dump(exclude={"id"}),
        "ownerId": result.assignment.userId, "source": "gemini",
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    if user_request is not None:
        data["userRequest"] = user_request.model_dump(mode="json")
    return data


def _read_active(db, transaction, uid, user):
    """Read user-owned assignments; lazily move an older active assignment atomically."""
    pointer = user.get("activeQuestId")
    if pointer is not None and not _valid_id(pointer):
        raise HTTPException(409, "Current assignment pointer is invalid")
    active = []
    snapshots = list(sidequests(db, uid).stream(transaction=transaction, timeout=10))
    for snapshot in snapshots:
        data = snapshot.to_dict()
        if data.get("status") == "assigned":
            active.append(snapshot)
        elif snapshot.id == pointer and data.get("status") not in ("completed", "skipped"):
            raise HTTPException(409, "Current assignment state is invalid")
    legacy_snapshots = list(db.collection(ASSIGNMENTS).where(
        filter=FieldFilter("userId", "==", uid),
    ).stream(transaction=transaction, timeout=10))
    legacy = [snapshot for snapshot in legacy_snapshots if snapshot.to_dict().get("status") == "assigned"]
    if len(active) + len(legacy) > 1:
        raise HTTPException(409, "Multiple active assignments need reconciliation")
    if active:
        return _nested_response(uid, active[0])
    if not legacy:
        completed_legacy = any(item.to_dict().get("questId") == pointer
                               and item.to_dict().get("status") == "completed"
                               for item in legacy_snapshots)
        if pointer is not None and not completed_legacy and not any(item.id == pointer for item in snapshots):
            transaction.update(db.collection(USERS).document(uid), {"activeQuestId": firestore.DELETE_FIELD})
        return None
    result = _stored_response(db, transaction, uid, legacy[0])
    if any(snapshot.id == result.quest.id for snapshot in snapshots):
        raise HTTPException(409, "Legacy assignment conflicts with saved sidequest")
    # All reads above precede writes. Mark the old record migrated so older
    # completion handlers cannot also award it. No existing XP is changed.
    target = sidequests(db, uid).document(result.quest.id)
    transaction.create(target, _sidequest_data(result))
    transaction.update(legacy[0].reference, {"status": "migrated", "migratedTo": target.path})
    transaction.update(db.collection(USERS).document(uid), {"activeQuestId": result.quest.id})
    return result


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

    return _run_transaction(db, read)


def save_verified_assignment(db, uid, preview, policy, user_request: Optional[GenerateQuestRequest] = None, *, replace_quest_id=None):
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
        radiusMeters=policy.radiusMeters, xpReward=quest_xp_reward(proposed.estimatedMinutes), isActive=True,
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
        if replace_quest_id is not None:
            if existing is None or existing.quest.id != replace_quest_id:
                raise HTTPException(409, "Your current quest changed. Reopen it before generating another.")
            transaction.update(sidequests(db, uid).document(replace_quest_id), {
                "status": "skipped", "isActive": False, "skippedAt": firestore.SERVER_TIMESTAMP,
                "replacedByQuestId": quest_id,
            })
        elif existing is not None:
            return existing
        # Reading the same user document serializes competing creators; all
        # reads precede writes. The losing callback reuses the committed winner.
        transaction.create(sidequests(db, uid).document(quest_id), _sidequest_data(result, user_request))
        transaction.update(user_ref, {"activeQuestId": quest_id})
        return result

    return _run_transaction(db, commit)


def assign_generated_quest(db, uid, preferences, resolver, timings=None, user_request: Optional[GenerateQuestRequest] = None):
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
        return save_verified_assignment(db, uid, preview, policy, user_request)


def replace_generated_quest(db, uid, quest_id, preferences, resolver, timings=None, user_request: Optional[GenerateQuestRequest] = None):
    """Generate first, then compare-and-swap only the displayed active assignment.

    A concurrent replacement/completion wins safely; stale requests return 409.
    Provider failures never skip the current quest. Skipping never awards XP.
    """
    _check_uid(uid)
    if not _valid_id(quest_id):
        raise HTTPException(400, "Invalid quest ID")
    with record_timing(timings, "lookup"):
        existing = get_current_assignment(db, uid)
    if existing is None or existing.quest.id != quest_id:
        raise HTTPException(409, "Your current quest changed. Reopen it before generating another.")
    if resolver is None:
        raise HTTPException(503, "Destination resolver is required before replacing your quest")
    policy = get_assignment_policy()
    preview = generate_preview(preferences, resolver, timings=timings, previous_quest=existing.quest)
    with record_timing(timings, "save"):
        return save_verified_assignment(db, uid, preview, policy, user_request, replace_quest_id=quest_id)
