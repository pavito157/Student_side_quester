"""Atomic quest completion + XP award.

Data used (matches the frontend's existing collection name, capital U):
    Users/{clerkUserId}                          -> has an "xp" field
    Users/{clerkUserId}/assignedQuests/{id}      -> status: "assigned" | "completed"
                                                    xp: whole number set by the SERVER
                                                    when the quest was assigned
"""
import math

from firebase_admin import firestore

from firebase_config import db

USERS = "Users"
ASSIGNED = "assignedQuests"


def _clean_xp(value):
    """Returns the XP as a non-negative whole number, or None if it is invalid."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0 or value != int(value):
        return None
    return int(value)


@firestore.transactional
def _complete_in_transaction(transaction, user_ref, assigned_ref):
    # Firestore rule: every read must happen before any write.
    # This function may be re-run automatically if another request touches the
    # same documents, so it must not do anything outside Firestore.
    assigned = assigned_ref.get(transaction=transaction)
    user = user_ref.get(transaction=transaction)

    if not assigned.exists or not user.exists:
        return {"status": "not_found"}

    data = assigned.to_dict()
    status = data.get("status")

    # Once-only guarantee: a completed quest never awards XP again.
    if status == "completed":
        return {"status": "already_completed", "xp_awarded": 0}
    if status != "assigned":
        return {"status": "invalid_status"}

    xp = _clean_xp(data.get("xp"))
    if xp is None:
        return {"status": "invalid_xp"}

    # Both writes commit together, or neither does.
    transaction.update(assigned_ref, {
        "status": "completed",
        "completedAt": firestore.SERVER_TIMESTAMP,
        "xpAwarded": xp,
    })
    transaction.update(user_ref, {"xp": firestore.Increment(xp)})

    return {"status": "completed", "xp_awarded": xp}


def complete_assigned_quest(user_id: str, assigned_quest_id: str) -> dict:
    """user_id must come from a VERIFIED token (see auth.py), never from the request."""
    user_ref = db.collection(USERS).document(user_id)
    assigned_ref = user_ref.collection(ASSIGNED).document(assigned_quest_id)
    return _complete_in_transaction(db.transaction(), user_ref, assigned_ref)
