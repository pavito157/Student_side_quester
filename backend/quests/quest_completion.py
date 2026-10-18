"""Atomic quest completion, independent of FastAPI application startup."""

from firebase_admin import firestore

from backend.quests.quest_validation import validate_completion
from backend.auth.firebase_helpers import USERS
from backend.quests.quest_contracts import MAX_QUEST_DESTINATIONS, MAX_QUEST_STEPS
from backend.users.xp import read_xp, xp_for_stop

ASSIGNMENTS = "userQuests"


class CompletionError(Exception):
    def __init__(self, status_code, detail):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def complete_quest(
    db, user_id, quest_id, latitude, longitude, accuracy, max_accuracy=50, stop_index=0,
):
    """user_id MUST come from a verified Firebase ID token, never request JSON.

    Firestore retries the callback on conflicts. All reads precede all writes;
    the assignment state and both XP totals commit together or not at all.
    """
    if any(not isinstance(value, str) or not value or "/" in value
           for value in (user_id, quest_id)):
        raise CompletionError(400, "Invalid user or quest ID.")
    nested_ref = db.collection(USERS).document(user_id).collection("sidequests").document(quest_id)
    legacy_ref = db.collection(ASSIGNMENTS).document(f"{user_id}_{quest_id}")
    quest_ref = db.collection("quests").document(quest_id)
    user_ref = db.collection(USERS).document(user_id)

    # Event quests use their canonical event policy and the same attendance claim
    # as board check-in. Never award through the ordinary, untimed quest path.
    candidate = nested_ref.get() if quest_id.startswith("event-") else None
    event_id = candidate.to_dict().get("sourceGlobalEventId") if candidate is not None and candidate.exists else None
    if event_id:
        from backend.global_quests import check_in, CheckIn
        from backend.event_quests import assignment_id
        from fastapi import HTTPException
        if not isinstance(event_id, str) or quest_id != assignment_id(event_id) or stop_index != 0:
            raise CompletionError(409, "Invalid event quest assignment.")
        try:
            result = check_in(db, user_id, event_id, CheckIn(latitude=latitude, longitude=longitude, accuracy=accuracy), require_assignment=True)
        except HTTPException as error:
            raise CompletionError(error.status_code, error.detail) from None
        return {**result, "valid": True, "reason": "Event attendance verified.", "questId": quest_id,
                "stopIndex": 0, "xpAwardedSoFar": result["xpAwarded"], "completedStops": [0], "totalStops": 1}

    @firestore.transactional
    def commit(transaction):
        nested = nested_ref.get(transaction=transaction)
        assignment_ref = nested_ref if nested.exists else legacy_ref
        assignment_snapshot = nested if nested.exists else legacy_ref.get(transaction=transaction)
        quest_snapshot = nested if nested.exists else quest_ref.get(transaction=transaction)
        if not assignment_snapshot.exists or not quest_snapshot.exists:
            raise CompletionError(404, "Quest or assignment not found.")
        assignment, quest = assignment_snapshot.to_dict(), quest_snapshot.to_dict()
        if quest.get("sourceGlobalEventId"):
            raise CompletionError(409, "Reload this event quest before checking in.")
        if (nested.exists and quest.get("ownerId") != user_id) or quest.get("ownerId") not in (None, user_id):
            raise CompletionError(403, "This quest is not assigned to you.")
        if assignment.get("userId") != user_id:
            raise CompletionError(403, "This quest is not assigned to you.")
        if assignment.get("questId") != quest_id:
            raise CompletionError(409, "The assignment refers to a different quest.")
        if assignment.get("status") != "assigned":
            raise CompletionError(409, "This quest is not currently assigned.")
        if quest.get("isActive") is not True:
            raise CompletionError(409, "This quest is no longer active.")

        destinations = quest.get("destinations")
        if not destinations:
            destinations = [{
                "locationName": quest.get("locationName"),
                "latitude": quest.get("latitude"),
                "longitude": quest.get("longitude"),
            }]
        if (not isinstance(destinations, list)
                or not 1 <= len(destinations) <= MAX_QUEST_DESTINATIONS
                or type(stop_index) is not int or not 0 <= stop_index < len(destinations)):
            raise CompletionError(409, "The quest stop information is invalid.")
        completed_stops = quest.get("completedStops", [])
        if (not isinstance(completed_stops, list)
                or any(type(index) is not int or not 0 <= index < len(destinations)
                       for index in completed_stops)
                or len(set(completed_stops)) != len(completed_stops)):
            raise CompletionError(409, "The quest completion progress is invalid.")
        if stop_index in completed_stops:
            raise CompletionError(409, "This stop has already been completed.")
        if stop_index != len(completed_stops):
            raise CompletionError(409, "Complete the next stop in the route.")

        stop = destinations[stop_index]
        if not isinstance(stop, dict):
            raise CompletionError(409, "The quest destination is not configured correctly.")
        steps = quest.get("steps")
        if "stepProofMethods" not in quest:
            if len(destinations) > 1 and (
                not isinstance(steps, list) or len(steps) != len(destinations)
            ):
                steps = ["Legacy location-verified quest"] * len(destinations)
            elif not steps:
                steps = ["Legacy location-verified quest"]
        if not isinstance(steps, list):
            raise CompletionError(409, "The quest step information is invalid.")
        step_destinations = quest.get("stepDestinationIndexes")
        if step_destinations is None:
            step_destinations = (
                list(range(len(destinations)))
                if len(destinations) > 1 and len(steps) == len(destinations)
                else [0] * len(steps)
            )
        proof_methods = quest.get("stepProofMethods", ["location"] * (len(steps) or 1))
        if not isinstance(proof_methods, list):
            raise CompletionError(409, "The quest step proof information is invalid.")
        verified_photo_steps = quest.get("verifiedPhotoSteps", [])
        skipped_photo_steps = quest.get("skippedPhotoSteps", [])
        if (not isinstance(proof_methods, list) or len(proof_methods) != len(steps)
                or any(method not in ("location", "photo", "recreation") for method in proof_methods)
                or not isinstance(verified_photo_steps, list)
                or not isinstance(skipped_photo_steps, list)
                or any(type(index) is not int or not 0 <= index < len(steps)
                       or proof_methods[index] != "photo"
                       for index in [*verified_photo_steps, *skipped_photo_steps])
                or len(set([*verified_photo_steps, *skipped_photo_steps]))
                   != len([*verified_photo_steps, *skipped_photo_steps])):
            raise CompletionError(409, "The quest step proof information is invalid.")
        if (not isinstance(step_destinations, list) or len(step_destinations) != len(steps)
                or len(steps) > MAX_QUEST_STEPS
                or any(type(index) is not int or not 0 <= index < len(destinations)
                       for index in step_destinations)
                or step_destinations != sorted(step_destinations)
                or set(step_destinations) != set(range(len(destinations)))):
            raise CompletionError(409, "The quest step-to-destination information is invalid.")
        stop_step_indexes = [
            index for index, destination_index in enumerate(step_destinations)
            if destination_index == stop_index
        ]
        required_photo_steps = [
            index for index in stop_step_indexes if proof_methods[index] == "photo"
        ]
        if any(step_index not in verified_photo_steps and step_index not in skipped_photo_steps
               for step_index in required_photo_steps):
            raise CompletionError(409, "Submit photo proof or explicitly skip it before completing this step.")
        needs_location = any(proof_methods[index] == "location" for index in stop_step_indexes)
        if needs_location:
            stop_quest = {
                **quest,
                "latitude": stop.get("latitude"),
                "longitude": stop.get("longitude"),
            }
            validation = validate_completion(
                user_id, assignment, stop_quest, latitude, longitude, accuracy, max_accuracy,
            )
        else:
            validation = {"valid": True, "reason": "Step verification requirements are complete."}
        if not validation["valid"]:
            raise CompletionError(400, validation)
        total_reward = quest.get("xpReward")
        if type(total_reward) is not int or total_reward < 0:
            raise CompletionError(409, "The quest XP reward is not configured correctly.")
        stop_count = len(destinations)
        eligible_stops = [
            index for index in range(stop_count)
            if any(
                method in ("location", "photo")
                for step_index, method in enumerate(proof_methods)
                if step_destinations[step_index] == index
            )
        ]
        skipped_stops = {step_destinations[index] for index in skipped_photo_steps}
        if stop_count > 1:
            reward = (
                0 if stop_index not in eligible_stops or stop_index in skipped_stops
                else xp_for_stop(total_reward, len(eligible_stops), eligible_stops.index(stop_index))
            )
        else:
            reward = 0 if skipped_stops or not eligible_stops else total_reward
        updated_stops = [*completed_stops, stop_index]
        if stop_count > 1:
            total_awarded = sum(
                0 if index not in eligible_stops or index in skipped_stops
                else xp_for_stop(total_reward, len(eligible_stops), eligible_stops.index(index))
                for index in updated_stops
            )
        else:
            total_awarded = 0 if skipped_stops else total_reward
        quest_complete = len(updated_stops) == stop_count

        user_snapshot = user_ref.get(transaction=transaction)
        if not user_snapshot.exists:
            raise CompletionError(409, "Create your user profile and choose a dorm first.")
        user = user_snapshot.to_dict()
        dorm_id = user.get("dormId")
        if not isinstance(dorm_id, str) or not dorm_id or "/" in dorm_id:
            raise CompletionError(409, "Choose a valid dorm first.")
        dorm_ref = db.collection("dorms").document(dorm_id)
        dorm_snapshot = dorm_ref.get(transaction=transaction)
        if not dorm_snapshot.exists:
            raise CompletionError(409, "Your dorm no longer exists.")
        dorm = dorm_snapshot.to_dict()
        try:
            user_xp, dorm_xp = read_xp(user), read_xp(dorm)
        except ValueError:
            raise CompletionError(409, "User and dorm XP totals must be nonnegative integers.") from None

        # Firestore integer fields are signed 64-bit values.
        if any(balance + reward > 2**63 - 1 for balance in (user_xp, dorm_xp)):
            raise CompletionError(409, "The XP award exceeds the supported total.")
        if quest_complete:
            transaction.delete(assignment_ref)
            if not nested.exists and quest.get("ownerId") == user_id:
                transaction.delete(quest_ref)
        else:
            progress_ref = assignment_ref if nested.exists else quest_ref
            transaction.update(progress_ref, {
                "completedStops": updated_stops,
                "xpAwardedSoFar": total_awarded,
            })
        user_changes = {"xp": user_xp + reward}
        if quest_complete and user.get("activeQuestId") == quest_id:
            user_changes["activeQuestId"] = firestore.DELETE_FIELD
        transaction.update(user_ref, user_changes)
        transaction.update(dorm_ref, {"xp": dorm_xp + reward})
        return {
            **validation,
            "questId": quest_id,
            "status": "completed" if quest_complete else "in_progress",
            "stopIndex": stop_index,
            "xpAwarded": reward,
            "xpAwardedSoFar": total_awarded,
            "completedStops": updated_stops,
            "totalStops": stop_count,
        }

    return commit(db.transaction())


def abandon_quest(db, user_id, quest_id):
    """Delete the authenticated user's active assignment without awarding XP."""
    if any(not isinstance(value, str) or not value or "/" in value
           for value in (user_id, quest_id)):
        raise CompletionError(400, "Invalid user or quest ID.")
    nested_ref = db.collection(USERS).document(user_id).collection("sidequests").document(quest_id)
    legacy_ref = db.collection(ASSIGNMENTS).document(f"{user_id}_{quest_id}")
    quest_ref = db.collection("quests").document(quest_id)
    user_ref = db.collection(USERS).document(user_id)

    @firestore.transactional
    def commit(transaction):
        nested = nested_ref.get(transaction=transaction)
        assignment_ref = nested_ref if nested.exists else legacy_ref
        assignment_snapshot = nested if nested.exists else legacy_ref.get(transaction=transaction)
        quest_snapshot = nested if nested.exists else quest_ref.get(transaction=transaction)
        if not assignment_snapshot.exists or not quest_snapshot.exists:
            raise CompletionError(404, "Active sidequest not found.")

        assignment, quest = assignment_snapshot.to_dict(), quest_snapshot.to_dict()
        if (nested.exists and quest.get("ownerId") != user_id) or quest.get("ownerId") not in (None, user_id):
            raise CompletionError(403, "This quest is not assigned to you.")
        if assignment.get("userId") != user_id:
            raise CompletionError(403, "This quest is not assigned to you.")
        if assignment.get("questId") != quest_id:
            raise CompletionError(409, "The assignment refers to a different quest.")
        if assignment.get("status") != "assigned" or quest.get("isActive") is not True:
            raise CompletionError(409, "This quest is not currently active.")

        user_snapshot = user_ref.get(transaction=transaction)
        transaction.delete(assignment_ref)
        if not nested.exists and quest.get("ownerId") == user_id:
            transaction.delete(quest_ref)
        if user_snapshot.exists and user_snapshot.to_dict().get("activeQuestId") == quest_id:
            transaction.update(user_ref, {"activeQuestId": firestore.DELETE_FIELD})
        return {"questId": quest_id, "status": "abandoned"}

    return commit(db.transaction())
