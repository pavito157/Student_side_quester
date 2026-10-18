"""Fixed preview, Gemini preview, and verified saved-assignment integration.

Keep this separate from the completion/XP routes while teammates integrate those.
The test response is intentionally incompatible with a saved-assignment result.
"""

from fastapi import APIRouter, Body, Depends, Request, Response
from typing import List, Optional

from backend.auth.firebase_helpers import bearer, current_uid, get_db
from backend.quests.quest_generation import generate_preview, get_destination_resolver
from backend.core.request_timing import record_timing
from backend.quests.quest_persistence import assign_generated_quest, get_current_assignment, replace_generated_quest, get_active_assignments
from backend.quests.quest_contracts import (
    AssignQuestRequest, NormalizedQuestPreferences, QuestPreviewResponse, TestQuestPreview,
    GenerateQuestRequest, GeneratedQuestResponse,
    AssignQuestResponse,
)

router = APIRouter(tags=["Quest integration"])


def timed_current_uid(request: Request, credentials=Depends(bearer)):
    with record_timing(getattr(request.state, "quest_timings", None), "auth"):
        return current_uid(credentials)


def optional_timed_uid(request: Request, credentials=Depends(bearer)):
    if credentials is None:
        return None
    return timed_current_uid(request, credentials)


REQUEST_EXAMPLE = {
    "preferences": "I enjoy programming and spending time in nature.",
    "username": "Example Student",
    "location": "101 Museum Rd, Gainesville, FL 32603, USA",
    "time": {"selection": "120", "customMinutes": None},
    "budget": {"selection": "10-25", "customDollars": None},
    "distance": None,
    "goals": ["Learn Computer Science"],
    "vibePreferences": "I want a relaxed recreational activity.",
}


def build_test_preview(preferences: NormalizedQuestPreferences) -> QuestPreviewResponse:
    """Return the same quest for every input while echoing validated constraints."""
    return QuestPreviewResponse(
        message=("Fixed integration preview. Inputs were validated, but the quest is not "
                 "personalized or filtered. Nothing was saved and no XP was awarded."),
        quest=TestQuestPreview(
            title="Take an outdoor observation break",
            description="A fixed test quest to verify the frontend-to-FastAPI connection.",
            steps=["Find a publicly accessible outdoor campus spot.",
                   "Notice three interesting things around you.",
                   "Write a short note about what you observed."],
            locationName="UF campus (illustrative; no destination selected)",
            estimatedMinutes=20,
            estimatedCostDollars=0,
        ),
        normalizedPreferences=preferences,
    )


@router.post(
    "/quests/preview", response_model=QuestPreviewResponse,
    summary="Return a fixed test quest (not saved)",
    description=("Task 3 preview only. Requires a verified Firebase ID token. "
                 "Validates the frontend payload and returns a constant test quest plus "
                 "normalized preferences. No Gemini calls, distance matching, Firestore "
                 "writes, assignments, or XP changes are performed. Always HTTP 200 on "
                 "success; this is not the future persisted HTTP 201 response."),
    responses={401: {"description": "Missing or invalid Firebase ID token"},
               403: {"description": "Verified email account required"}},
)
def preview_assignment(
    response: Response,
    payload: AssignQuestRequest = Body(..., openapi_examples={
        "frontend": {"summary": "Frontend team's selection-based payload", "value": REQUEST_EXAMPLE},
    }),
    _uid: str = Depends(current_uid),
):
    response.headers["Cache-Control"] = "no-store"
    return build_test_preview(payload.normalize())


@router.post(
    "/quests/generate", response_model=GeneratedQuestResponse,
    summary="Generate a personalized Gemini preview (not saved)",
    description=("Public guest previews are allowed and are never saved. Signed-in users "
                 "may also request a preview with a verified Firebase ID token. Discovers and verifies a city "
                 "destination first, then Gemini writes activity content. Validates estimated time and cost. "
                 "The connected selector verifies the destination and city scope; "
                 "requested distance requires origin coordinates. No Firestore access or XP writes."),
)
def generate_assignment_preview(
    request: Request,
    response: Response,
    payload: GenerateQuestRequest = Body(..., openapi_examples={
        "frontend": {"summary": "No distance limit", "value": REQUEST_EXAMPLE},
    }),
    _uid: Optional[str] = Depends(optional_timed_uid),
    resolver=Depends(get_destination_resolver),
):
    response.headers["Cache-Control"] = "no-store"
    return generate_preview(payload.normalize(), resolver,
                            timings=getattr(request.state, "quest_timings", None))


@router.post(
    "/quests/assign", response_model=AssignQuestResponse, status_code=201,
    summary="Add a saved quest (maximum three active)",
    description=("Generates a new independent active quest if fewer than three are active. "
                 "Requires destination resolution and atomically saves one user-owned sidequest "
                 "and user activeQuestId. No XP awarded. Identity comes only from the token."),
    responses={429: {"description": "Three active quests already saved or provider quota reached"},
               409: {"description": "Profile/state conflict or destination beyond distance limit"},
               503: {"description": "Resolver/configuration/database/provider unavailable"}},
)
def assign(
    request: Request, response: Response,
    payload: GenerateQuestRequest = Body(..., openapi_examples={
        "frontend": {"value": REQUEST_EXAMPLE},
    }),
    uid: str = Depends(timed_current_uid), resolver=Depends(get_destination_resolver),
):
    result = assign_generated_quest(
        get_db(), uid, payload.normalize(), resolver,
        timings=getattr(request.state, "quest_timings", None),
        user_request=payload,
    )
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/me/quest", response_model=Optional[AssignQuestResponse],
            summary="Read the current saved assignment; null if none is active")
def current_assignment(request: Request, response: Response, uid: str = Depends(timed_current_uid)):
    response.headers["Cache-Control"] = "no-store"
    with record_timing(getattr(request.state, "quest_timings", None), "lookup"):
        return get_current_assignment(get_db(), uid)


@router.post("/quests/{quest_id}/replace", deprecated=True, response_model=AssignQuestResponse, status_code=201)
@router.post("/quests/{quest_id}/another", response_model=AssignQuestResponse, status_code=201,
             summary="Add another active quest without replacing this one",
             responses={409: {"description": "Displayed quest is no longer active; reopen the current quest"},
                        429: {"description": "Three active quests already saved"}})
def replace_assignment(
    quest_id: str, request: Request, response: Response,
    payload: GenerateQuestRequest,
    uid: str = Depends(timed_current_uid), resolver=Depends(get_destination_resolver),
):
    result = replace_generated_quest(get_db(), uid, quest_id, payload.normalize(), resolver,
                                     timings=getattr(request.state, "quest_timings", None), user_request=payload)
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/me/active-quests", response_model=List[AssignQuestResponse],
            summary="Read all active quests and reconcile earlier saved alternatives")
def active_assignments(response: Response, uid: str = Depends(timed_current_uid)):
    response.headers["Cache-Control"] = "no-store"
    return get_active_assignments(get_db(), uid)
