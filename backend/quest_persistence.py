"""Up to three independent active quests per user. Generation never awards XP.

Gemini/place resolution run outside transactions. The final transaction rechecks
capacity and creates a user-scoped sidequest + user pointer together. Concurrent
requests cannot exceed three active quests or leave orphan records.
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
    AssignedQuest, AssignQuestResponse, ContractModel, GenerateQuestRequest, GeneratedQuestResponse, SavedAssignment, MAX_ACTIVE_QUESTS,
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


def _nested_response(uid, snapshot, data=None):
    data = snapshot.to_dict() if data is None else data
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


def _read_active_list(db, transaction, uid, user):
    """Read all active quests; migrate old records with all reads before writes."""
    pointer = user.get("activeQuestId")
    if pointer is not None and not _valid_id(pointer):
        raise HTTPException(409, "Current assignment pointer is invalid")
    snapshots = list(sidequests(db, uid).stream(transaction=transaction, timeout=10))
    active = [_nested_response(uid, item) for item in snapshots
              if item.to_dict().get("status") == "assigned"]
    operations = []
    ids = {item.id for item in snapshots}
    # Preserve support for older global assignments. Validate everything before
    # queuing any migrations so a later read never follows a write.
    for item in db.collection(ASSIGNMENTS).where(
        filter=FieldFilter("userId", "==", uid),
    ).stream(transaction=transaction, timeout=10):
        if item.to_dict().get("status") != "assigned":
            continue
        saved = _stored_response(db, transaction, uid, item)
        if saved.quest.id in ids:
            raise HTTPException(409, "Legacy assignment conflicts with saved sidequest")
        ids.add(saved.quest.id)
        active.append(saved)
        target = sidequests(db, uid).document(saved.quest.id)
        operations.append(("create", target, _sidequest_data(saved)))
        operations.append(("update", item.reference, {"status": "migrated", "migratedTo": target.path}))
    if len(active) > MAX_ACTIVE_QUESTS:
        raise HTTPException(409, "More than three active quests need reconciliation")

    # One-time recovery of alternatives skipped by the previous replacement
    # feature. Follow only the chain leading to a currently active quest.
    # Explicitly abandoned/completed records are never recreated.
    if user.get("activeQuestSchemaVersion") != 2:
        recovered = {item.quest.id for item in active}
        candidates = {item.id: item for item in snapshots if item.to_dict().get("status") == "skipped"}
        while active and len(active) < MAX_ACTIVE_QUESTS:
            match = next((item for item in candidates.values()
                          if item.to_dict().get("replacedByQuestId") in recovered), None)
            if match is None:
                break
            del candidates[match.id]
            data = {**match.to_dict(), "status": "assigned", "isActive": True}
            saved = _nested_response(uid, match, data)
            active.append(saved)
            recovered.add(match.id)
            operations.append(("update", match.reference, {
                "status": "assigned", "isActive": True,
                "skippedAt": firestore.DELETE_FIELD, "replacedByQuestId": firestore.DELETE_FIELD,
                "restoredFromReplacement": True,
            }))
    active.sort(key=lambda item: (item.quest.id != pointer, -item.assignment.assignedAt.timestamp(), item.quest.id))
    for method, ref, data in operations:
        getattr(transaction, method)(ref, data)
    updates = {}
    if user.get("activeQuestSchemaVersion") != 2:
        updates["activeQuestSchemaVersion"] = 2
    current_id = active[0].quest.id if active else None
    if pointer != current_id:
        updates["activeQuestId"] = current_id if current_id else firestore.DELETE_FIELD
    if updates:
        transaction.update(db.collection(USERS).document(uid), updates)
    return active


def _read_active(db, transaction, uid, user):
    active = _read_active_list(db, transaction, uid, user)
    return active[0] if active else None


def _run_transaction(db, callback, read_only=False):
    try:
        return firestore.transactional(callback)(db.transaction(read_only=read_only))
    except (GoogleAPICallError, RetryError, ValueError):
        raise HTTPException(503, "Assignment database temporarily unavailable. Retry safely.") from None


def get_active_assignments(db, uid):
    _check_uid(uid)
    def read(transaction):
        snapshot = db.collection(USERS).document(uid).get(transaction=transaction)
        if not snapshot.exists:
            raise HTTPException(409, "Sign in to initialize your user profile first")
        return _read_active_list(db, transaction, uid, snapshot.to_dict())
    return _run_transaction(db, read)


def get_current_assignment(db, uid):
    """Compatibility: return the most recently selected/generated active quest."""
    active = get_active_assignments(db, uid)
    return active[0] if active else None


def _check_capacity(active):
    if len(active) >= MAX_ACTIVE_QUESTS:
        raise HTTPException(429, "You already have three active quests. Complete or abandon one to make room.")


def save_verified_assignment(db, uid, preview, policy, user_request: Optional[GenerateQuestRequest] = None, *, source_quest_id=None):
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
        stepProofMethods=proposed.stepProofMethods, verifiedPhotoSteps=[], skippedPhotoSteps=[],
        locationName=destination.locationName, placeId=destination.placeId,
        latitude=destination.latitude, longitude=destination.longitude,
        destinations=preview.destinations if user_request and user_request.multiQuest else [],
        completedStops=[],
        radiusMeters=policy.radiusMeters,
        xpReward=(quest_xp_reward(proposed.estimatedMinutes)
                  if any(method in ("location", "photo") for method in proposed.stepProofMethods) else 0),
        isActive=True,
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
        active = _read_active_list(db, transaction, uid, user_snapshot.to_dict())
        if source_quest_id is not None and not any(item.quest.id == source_quest_id for item in active):
            raise HTTPException(409, "This quest is no longer active. Open one of your active quests and try again.")
        _check_capacity(active)
        # Reading the same user document serializes competing creators; all
        # reads precede writes. A retry checks capacity against the committed state.
        transaction.create(sidequests(db, uid).document(quest_id), _sidequest_data(result, user_request))
        transaction.update(user_ref, {"activeQuestId": quest_id})
        return result

    return _run_transaction(db, commit)


def assign_generated_quest(db, uid, preferences, resolver, timings=None, user_request: Optional[GenerateQuestRequest] = None):
    return _generate_additional(db, uid, preferences, resolver, timings, user_request)


def _generate_additional(db, uid, preferences, resolver, timings, user_request, source_quest_id=None):
    with record_timing(timings, "lookup"):
        active = get_active_assignments(db, uid)
    source = next((item for item in active if item.quest.id == source_quest_id), None)
    if source_quest_id is not None and source is None:
        raise HTTPException(409, "This quest is no longer active. Open one of your active quests and try again.")
    _check_capacity(active)
    if resolver is None:
        raise HTTPException(503, "Destination resolver is required before saving a new quest")
    policy = get_assignment_policy()
    kwargs = {"previous_quest": source.quest} if source else {}
    preview = generate_preview(preferences, resolver, timings=timings, **kwargs)
    with record_timing(timings, "save"):
        return save_verified_assignment(db, uid, preview, policy, user_request, source_quest_id=source_quest_id)


def add_generated_quest(db, uid, quest_id, preferences, resolver, timings=None, user_request: Optional[GenerateQuestRequest] = None):
    _check_uid(uid)
    if not _valid_id(quest_id):
        raise HTTPException(400, "Invalid quest ID")
    return _generate_additional(db, uid, preferences, resolver, timings, user_request, quest_id)


# Compatibility for existing imports. Adding is deliberately non-destructive.
replace_generated_quest = add_generated_quest
