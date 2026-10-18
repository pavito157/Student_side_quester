"""Organization-published events and atomic, once-per-user attendance rewards."""
from datetime import datetime, timezone, timedelta
import os
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from google.api_core.exceptions import GoogleAPICallError, RetryError
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from backend.auth.firebase_helpers import USERS, current_uid, get_db
from backend.users.dorm_catalog import DORM_NAME_BY_ID
from backend.quests.quest_validation import calculate_distance
from backend.users.xp import read_xp
from .organization_access import authorize_publishing, publishing_organizations

router = APIRouter(tags=["Global quests"])
ORGANIZATIONS = "Organizations"
EVENTS = "GlobalQuests"
CLAIMS = "globalQuestCompletions"


def utc_now():
    return datetime.now(timezone.utc)


class EventPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    xpReward: int = Field(default=25, strict=True, ge=1, le=500)
    radiusMeters: int = Field(default=100, strict=True, ge=10, le=1000)
    maxAccuracyMeters: int = Field(default=50, strict=True, ge=1, le=200)
    verificationMode: Literal["gps", "honor"] = "gps"
    graceMinutes: int = Field(default=0, strict=True, ge=0, le=60)


def default_policy():
    try:
        return EventPolicy(
            xpReward=int(os.getenv("GLOBAL_QUEST_DEFAULT_XP", "25")),
            radiusMeters=int(os.getenv("GLOBAL_QUEST_RADIUS_METERS", "100")),
            maxAccuracyMeters=int(os.getenv("GLOBAL_QUEST_MAX_ACCURACY_METERS", "50")),
            verificationMode=os.getenv("GLOBAL_QUEST_VERIFICATION_MODE", "gps"),
            graceMinutes=int(os.getenv("GLOBAL_QUEST_GRACE_MINUTES", "0")),
        )
    except (ValueError, TypeError):
        raise HTTPException(503, "Global quest defaults are not configured correctly.") from None


class CreateEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    organizationId: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=10, max_length=3000)
    locationName: str = Field(min_length=2, max_length=300)
    latitude: float = Field(strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(strict=True, ge=-180, le=180, allow_inf_nan=False)
    startsAt: AwareDatetime
    endsAt: AwareDatetime

    @model_validator(mode="after")
    def valid_window(self):
        if self.endsAt <= self.startsAt or self.endsAt - self.startsAt > timedelta(days=7):
            raise ValueError("Event end must follow its start, within seven days.")
        return self


class GlobalEvent(CreateEvent, EventPolicy):
    id: str
    organizationName: str
    createdBy: str
    createdAt: AwareDatetime
    xpReward: int = Field(strict=True, ge=1, le=500)
    status: Literal["published"] = "published"


class CheckIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: Optional[float] = Field(default=None, strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: Optional[float] = Field(default=None, strict=True, ge=-180, le=180, allow_inf_nan=False)
    accuracy: Optional[float] = Field(default=None, strict=True, gt=0, allow_inf_nan=False)


def publish_event(db, uid, payload):
    policy = default_policy()
    if payload.endsAt <= utc_now():
        raise HTTPException(422, "The event must end in the future.")
    ref = db.collection(EVENTS).document()

    @firestore.transactional
    def commit(transaction):
        name = authorize_publishing(db, uid, payload.organizationId, transaction)
        event = GlobalEvent(**{
            **policy.model_dump(), **payload.model_dump(),
            "id": ref.id, "organizationName": name, "createdBy": uid, "createdAt": utc_now(),
        })
        transaction.create(ref, event.model_dump())
        return event
    return commit(db.transaction())


def check_in(db, uid, event_id, position):
    event_ref = db.collection(EVENTS).document(event_id)
    user_ref = db.collection(USERS).document(uid)
    claim_ref = user_ref.collection(CLAIMS).document(event_id)

    @firestore.transactional
    def commit(transaction):
        snapshot = event_ref.get(transaction=transaction)
        if not snapshot.exists:
            raise HTTPException(404, "Global quest not found.")
        try:
            event = GlobalEvent.model_validate(snapshot.to_dict())
        except ValueError:
            raise HTTPException(409, "This global quest needs repair.") from None
        if event.id != event_id:
            raise HTTPException(409, "This global quest needs repair.")
        claim = claim_ref.get(transaction=transaction)
        if claim.exists:
            raise HTTPException(409, "You already earned XP for this event.")
        # Server time is checked on every transaction retry, never client time.
        now = utc_now()
        grace = timedelta(minutes=event.graceMinutes)
        if not event.startsAt - grace <= now <= event.endsAt + grace:
            raise HTTPException(409, "Check in during the scheduled event time.")
        distance = None
        if event.verificationMode == "gps":
            if position.latitude is None or position.longitude is None or position.accuracy is None:
                raise HTTPException(422, "A fresh GPS position and accuracy are required.")
            if position.accuracy > event.maxAccuracyMeters:
                raise HTTPException(400, "Location is too imprecise. Enable precise location and try outdoors.")
            distance = calculate_distance(position.latitude, position.longitude, event.latitude, event.longitude)
            if distance + position.accuracy > event.radiusMeters:
                raise HTTPException(400, "Move closer to the event venue to check in.")
        profile = user_ref.get(transaction=transaction)
        if not profile.exists:
            raise HTTPException(409, "Create your profile and choose a residence first.")
        user = profile.to_dict()
        dorm_id = user.get("dormId")
        if dorm_id not in DORM_NAME_BY_ID:
            raise HTTPException(409, "Choose a valid residence first.")
        dorm_ref = db.collection("dorms").document(dorm_id)
        dorm_snapshot = dorm_ref.get(transaction=transaction)
        if not dorm_snapshot.exists:
            raise HTTPException(409, "Your residence XP record is missing.")
        try:
            user_xp, dorm_xp = read_xp(user), read_xp(dorm_snapshot.to_dict())
        except ValueError:
            raise HTTPException(409, "User or residence XP balance needs repair.") from None
        reward = event.xpReward
        if any(balance + reward > 2**63 - 1 for balance in (user_xp, dorm_xp)):
            raise HTTPException(409, "XP balance exceeds the supported total.")
        transaction.create(claim_ref, {"eventId": event_id, "userId": uid,
            "xpAwarded": reward, "completedAt": now, "organizationId": event.organizationId})
        transaction.update(user_ref, {"xp": user_xp + reward})
        transaction.update(dorm_ref, {"xp": dorm_xp + reward})
        return {"eventId": event_id, "status": "completed", "xpAwarded": reward,
                "distanceMeters": round(distance, 1) if distance is not None else None}
    return commit(db.transaction())


@router.get("/global-quests")
def list_events(uid: str = Depends(current_uid), db=Depends(get_db)):
    try:
        policy = default_policy()
        organizations, role = publishing_organizations(db, uid)
        now = utc_now()
        # Include grace-window events without a composite index.
        snapshots = db.collection(EVENTS).where("endsAt", ">=", now - timedelta(minutes=60)).order_by("endsAt").limit(50).stream()
        events = []
        for snapshot in snapshots:
            event = GlobalEvent.model_validate(snapshot.to_dict())
            if event.endsAt + timedelta(minutes=event.graceMinutes) < now:
                continue
            completed = db.collection(USERS).document(uid).collection(CLAIMS).document(snapshot.id).get().exists
            events.append({**event.model_dump(mode="json"), "completed": completed})
        events.sort(key=lambda event: event["startsAt"])
        return {"quests": events, "organizations": organizations, "adminRole": role, "defaults": policy.model_dump()}
    except (GoogleAPICallError, RetryError):
        raise HTTPException(503, "Global quests are temporarily unavailable.") from None


@router.post("/global-quests", status_code=201, response_model=GlobalEvent)
def create_event(payload: CreateEvent, uid: str = Depends(current_uid), db=Depends(get_db)):
    try:
        return publish_event(db, uid, payload)
    except (GoogleAPICallError, RetryError):
        raise HTTPException(503, "Could not publish this global quest.") from None


@router.post("/global-quests/{event_id}/check-in")
def attend(event_id: str, position: CheckIn, uid: str = Depends(current_uid), db=Depends(get_db)):
    if not event_id or "/" in event_id or len(event_id) > 128:
        raise HTTPException(400, "Invalid event ID.")
    try:
        return check_in(db, uid, event_id, position)
    except (GoogleAPICallError, RetryError):
        raise HTTPException(503, "Could not check in. Try again.") from None
