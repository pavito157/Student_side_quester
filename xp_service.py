"""Compatibility entry point for the canonical GPS/XP completion transaction.

Generated assignments live at Users/{uid}/sidequests/{questId}. This helper
requires fresh reported GPS and delegates all state, reward, user XP and dorm XP
checks/writes to backend.quests.quest_completion; it does not run a separate transaction.
"""

from backend.auth.firebase_helpers import get_db
from backend.quests.quest_completion import complete_quest


def complete_assigned_quest(
    user_id: str, assigned_quest_id: str,
    latitude: float, longitude: float, accuracy: float,
    *, db=None, max_accuracy=50,
) -> dict:
    """user_id must come from the verified Firebase token dependency.

    assigned_quest_id is response.quest.id, not response.assignment.id.
    Returns the canonical camelCase completion JSON (including xpAwarded).
    CompletionError propagates unchanged for the API to map to HTTP errors.
    """
    return complete_quest(
        db if db is not None else get_db(), user_id, assigned_quest_id,
        latitude, longitude, accuracy, max_accuracy,
    )
