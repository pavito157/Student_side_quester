"""Authenticated individual and dorm XP leaderboards."""

from collections.abc import Mapping

from fastapi import APIRouter, Depends, HTTPException
from google.api_core.exceptions import GoogleAPICallError

from .dorm_catalog import DORM_CATALOG
from .firebase_helpers import current_uid, get_db
from .xp import read_xp

router = APIRouter(tags=["Leaderboards"])


class LeaderboardDataError(ValueError):
    """Stored profile data cannot be represented safely on a leaderboard."""


def _record(snapshot):
    data = snapshot.to_dict()
    if data is None:
        return {}
    if not isinstance(data, Mapping):
        raise LeaderboardDataError("A leaderboard record has an invalid format.")
    return data


def _user_xp(record):
    try:
        return read_xp(record, default=0)
    except (TypeError, ValueError):
        raise LeaderboardDataError("A user profile has an invalid XP balance.") from None


def _user_name(record):
    for field in ("username", "displayName"):
        value = record.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _stream(collection):
    try:
        return list(collection.stream())
    except GoogleAPICallError:
        raise HTTPException(503, "Leaderboard data is temporarily unavailable.") from None


@router.get("/leaderboard")
def individual_leaderboard(uid: str = Depends(current_uid), db=Depends(get_db)):
    """Return users ordered by their canonical XP balance."""
    del uid
    try:
        entries = []
        skipped_users = 0
        for snapshot in _stream(db.collection("Users")):
            record = _record(snapshot)
            username = _user_name(record)
            xp = _user_xp(record)
            if username is None:
                skipped_users += 1
                continue
            entries.append({"userId": snapshot.id, "username": username, "xp": xp})
    except LeaderboardDataError as error:
        raise HTTPException(503, str(error)) from None

    entries.sort(key=lambda entry: (-entry["xp"], entry["username"].casefold(), entry["userId"]))
    return {"leaderboard": entries, "skippedUsers": skipped_users}


@router.get("/leaderboard/dorms")
def dorm_leaderboard(uid: str = Depends(current_uid), db=Depends(get_db)):
    """Sum member XP by the canonical dorm IDs stored in user profiles."""
    del uid
    try:
        dorms = {
            dorm_id: {
                "dormId": dorm_id,
                "dormName": name,
                "xp": 0,
                "memberCount": 0,
            }
            for dorm_id, name in DORM_CATALOG
        }

        unassigned_users = 0
        for snapshot in _stream(db.collection("Users")):
            record = _record(snapshot)
            xp = _user_xp(record)
            dorm_id = record.get("dormId")
            if (
                not isinstance(dorm_id, str)
                or not dorm_id
                or "/" in dorm_id
                or dorm_id not in dorms
            ):
                unassigned_users += 1
                continue
            dorms[dorm_id]["xp"] += xp
            dorms[dorm_id]["memberCount"] += 1
    except LeaderboardDataError as error:
        raise HTTPException(503, str(error)) from None

    entries = sorted(
        dorms.values(),
        key=lambda entry: (-entry["xp"], entry["dormName"].casefold(), entry["dormId"]),
    )
    return {"leaderboard": entries, "unassignedUsers": unassigned_users}
