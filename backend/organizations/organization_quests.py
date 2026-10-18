"""Public organization quest board and acceptance workflow."""

from typing import Literal

from fastapi import HTTPException
from google.api_core.exceptions import GoogleAPICallError, RetryError
from pydantic import ConfigDict, Field, ValidationError

from backend.quests.quest_contracts import ContractModel, GenerateQuestRequest
from backend.quests.quest_generation import DestinationResolutionError, generate_preview
from backend.quests.quest_persistence import (
    _check_capacity, _check_organization_duplicate, _check_uid, get_active_assignments,
    get_assignment_policy, save_verified_assignment,
)
from backend.core.request_timing import record_timing
from backend.users.xp import quest_xp_reward

ORGANIZATIONS = "Organizations"
QUESTS_SUBCOLLECTION = "quests"


class OrganizationQuestMapLocation(ContractModel):
    name: str = Field(min_length=1, max_length=300)
    latitude: float = Field(strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(strict=True, ge=-180, le=180, allow_inf_nan=False)


class StoredOrganizationQuest(ContractModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=300)
    details: str = Field(min_length=1, max_length=1200)
    published: bool
    questRequest: GenerateQuestRequest


class OrganizationQuestBoardItem(ContractModel):
    organizationId: str = Field(min_length=1, max_length=128)
    organizationName: str = Field(min_length=1, max_length=120)
    questId: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=300)
    details: str = Field(min_length=1, max_length=1200)
    timeLabel: str = Field(min_length=1, max_length=80)
    mapLocation: OrganizationQuestMapLocation | None
    mapLocationStatus: Literal["available", "missing", "invalid"]
    xpPotential: int = Field(strict=True, ge=5, le=50)


def _time_label(request: GenerateQuestRequest) -> str:
    time = request.time
    if time.selection == "120":
        return "2+ hours"
    if time.selection == "custom":
        return f"Up to {time.customMinutes} minutes"
    if time.selection in ("30", "60"):
        return f"Up to {time.selection} minutes"
    return "Flexible"


def _xp_potential(request: GenerateQuestRequest) -> int:
    time = request.time
    if time.selection in ("30", "60"):
        return quest_xp_reward(int(time.selection))
    if time.selection == "custom":
        if time.customMinutes is None:
            raise ValueError("Custom organization quest time requires a minute limit.")
        return quest_xp_reward(time.customMinutes)
    return 50


def _public_item(organization_id: str, organization_name: str, quest_id: str, raw: dict):
    try:
        quest = StoredOrganizationQuest.model_validate(raw)
    except ValidationError:
        raise HTTPException(503, "A published organization quest is misconfigured.") from None
    if not quest.published or quest.questRequest.multiQuest:
        raise HTTPException(503, "A published organization quest has invalid settings.")
    if "latitude" in raw or "longitude" in raw:
        location_name = raw.get("locationName")
        if not isinstance(location_name, str) or not location_name.strip():
            location_name = quest.questRequest.location.strip() or quest.title
        try:
            map_location = OrganizationQuestMapLocation.model_validate({
                "name": location_name,
                "latitude": raw.get("latitude"),
                "longitude": raw.get("longitude"),
            })
            map_location_status = "available"
        except ValidationError:
            map_location = None
            map_location_status = "invalid"
    else:
        raw_map_location = raw.get("mapLocation")
        if raw_map_location is None:
            map_location = None
            map_location_status = "missing"
        else:
            try:
                map_location = OrganizationQuestMapLocation.model_validate(raw_map_location)
                map_location_status = "available"
            except ValidationError:
                map_location = None
                map_location_status = "invalid"
    return quest, OrganizationQuestBoardItem(
        organizationId=organization_id,
        organizationName=organization_name,
        questId=quest_id,
        title=quest.title,
        summary=quest.summary,
        details=quest.details,
        timeLabel=_time_label(quest.questRequest),
        mapLocation=map_location,
        mapLocationStatus=map_location_status,
        xpPotential=_xp_potential(quest.questRequest),
    )


def _organization_parent(db, organization_id: str):
    snapshot = db.collection(ORGANIZATIONS).document(organization_id).get(timeout=10)
    if not snapshot.exists:
        return None
    data = snapshot.to_dict()
    if not isinstance(data, dict) or data.get("isPublic") is not True:
        return None
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(503, "A public organization profile is misconfigured.")
    return name.strip()


def list_organization_quests(db) -> list[OrganizationQuestBoardItem]:
    """Return published quests only, with an explicit public response allowlist."""
    try:
        board = []
        for snapshot in db.collection_group(QUESTS_SUBCOLLECTION).stream(timeout=10):
            path = snapshot.reference.path.split("/")
            if (len(path) != 4 or path[0] != ORGANIZATIONS
                    or path[2] != QUESTS_SUBCOLLECTION):
                continue
            raw = snapshot.to_dict()
            if not isinstance(raw, dict) or raw.get("published") is not True:
                continue
            organization_id = path[1]
            organization_name = _organization_parent(db, organization_id)
            if organization_name is None:
                continue
            _, item = _public_item(organization_id, organization_name, snapshot.id, raw)
            board.append(item)
        return sorted(board, key=lambda item: (item.organizationName.casefold(), item.title.casefold()))
    except HTTPException:
        raise
    except (GoogleAPICallError, RetryError, ValueError):
        raise HTTPException(503, "Organization quests are temporarily unavailable.") from None


def get_organization_quest(db, organization_id: str, quest_id: str):
    if (not organization_id or len(organization_id) > 128 or "/" in organization_id
            or not quest_id or len(quest_id) > 128 or "/" in quest_id):
        raise HTTPException(404, "Organization quest not found.")
    try:
        organization_name = _organization_parent(db, organization_id)
        if organization_name is None:
            raise HTTPException(404, "Organization quest not found.")
        snapshot = (
            db.collection(ORGANIZATIONS).document(organization_id)
            .collection(QUESTS_SUBCOLLECTION).document(quest_id).get(timeout=10)
        )
        if not snapshot.exists:
            raise HTTPException(404, "Organization quest not found.")
        raw = snapshot.to_dict()
        if not isinstance(raw, dict) or raw.get("published") is not True:
            raise HTTPException(404, "Organization quest not found.")
        return _public_item(organization_id, organization_name, quest_id, raw)[0]
    except HTTPException:
        raise
    except (GoogleAPICallError, RetryError, ValueError):
        raise HTTPException(503, "Organization quest is temporarily unavailable.") from None


def accept_organization_quest(db, uid: str, organization_id: str, quest_id: str, resolver, timings=None):
    _check_uid(uid)
    organization_quest = get_organization_quest(db, organization_id, quest_id)
    with record_timing(timings, "lookup"):
        active = get_active_assignments(db, uid)
    _check_organization_duplicate(active, organization_id, quest_id)
    _check_capacity(active)
    if resolver is None:
        raise HTTPException(503, "Destination resolver is required before accepting an organization quest.")

    request = organization_quest.questRequest
    try:
        preview = generate_preview(request.normalize(), resolver, timings=timings)
    except DestinationResolutionError:
        raise HTTPException(503, "The organization quest destination is temporarily unavailable.") from None
    with record_timing(timings, "save"):
        return save_verified_assignment(
            db, uid, preview, get_assignment_policy(), request,
            source_organization_id=organization_id,
            source_organization_quest_id=quest_id,
        )
