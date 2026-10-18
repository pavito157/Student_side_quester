"""Authenticated residence selection for the signed-in user."""

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from google.api_core.exceptions import GoogleAPICallError
from google.api_core.exceptions import RetryError
from pydantic import BaseModel, ConfigDict, Field

from backend.users.dorm_catalog import DORM_NAME_BY_ID, DORM_OPTIONS
from backend.auth.firebase_helpers import USERS, current_uid, get_db
from backend.users.xp import read_xp

router = APIRouter(tags=["Dorms"])


class DormSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dormId: str = Field(strict=True, min_length=1, max_length=64)


def selected_dorm_id(db, user_id):
    snapshot = db.collection(USERS).document(user_id).get()
    if not snapshot.exists:
        raise HTTPException(404, "User profile not found.")
    profile = snapshot.to_dict() or {}
    dorm_id = profile.get("dormId")
    if dorm_id is None:
        return None
    if not isinstance(dorm_id, str) or dorm_id not in DORM_NAME_BY_ID:
        raise HTTPException(409, "Your saved residence selection needs repair.")
    return dorm_id


def save_dorm_selection(db, user_id, dorm_id):
    if dorm_id not in DORM_NAME_BY_ID:
        raise HTTPException(422, "Choose a residence from the available list.")

    user_ref = db.collection(USERS).document(user_id)
    dorm_ref = db.collection("dorms").document(dorm_id)

    @firestore.transactional
    def commit(transaction):
        user_snapshot = user_ref.get(transaction=transaction)
        dorm_snapshot = dorm_ref.get(transaction=transaction)
        if not user_snapshot.exists:
            raise HTTPException(404, "User profile not found.")

        if dorm_snapshot.exists:
            dorm_data = dorm_snapshot.to_dict() or {}
            try:
                dorm_xp = read_xp(dorm_data, default=0)
            except ValueError:
                raise HTTPException(409, "This residence XP balance needs repair.") from None
            transaction.set(
                dorm_ref,
                {"name": DORM_NAME_BY_ID[dorm_id], "xp": dorm_xp},
                merge=True,
            )
        else:
            transaction.set(
                dorm_ref,
                {"name": DORM_NAME_BY_ID[dorm_id], "xp": 0},
            )

        transaction.set(user_ref, {"dormId": dorm_id}, merge=True)

    commit(db.transaction())
    return {"dormId": dorm_id, "dormName": DORM_NAME_BY_ID[dorm_id]}


@router.get("/me/dorm")
def get_my_dorm(uid: str = Depends(current_uid), db=Depends(get_db)):
    try:
        dorm_id = selected_dorm_id(db, uid)
        return {
            "dormId": dorm_id,
            "dormName": DORM_NAME_BY_ID[dorm_id] if dorm_id else None,
            "dorms": list(DORM_OPTIONS),
        }
    except GoogleAPICallError:
        raise HTTPException(503, "Residence information is temporarily unavailable.") from None


@router.put("/me/dorm")
def update_my_dorm(
    selection: DormSelection,
    uid: str = Depends(current_uid),
    db=Depends(get_db),
):
    try:
        selected = save_dorm_selection(db, uid, selection.dormId)
    except HTTPException:
        raise
    except (GoogleAPICallError, RetryError):
        raise HTTPException(503, "Could not save your residence selection.") from None
    return {**selected, "dorms": list(DORM_OPTIONS)}
