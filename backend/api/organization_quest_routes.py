"""Public organization quest listing and authenticated acceptance routes."""

from typing import List

from fastapi import APIRouter, Depends, Request, Response

from backend.auth.firebase_helpers import get_db
from backend.organizations.organization_quests import (
    OrganizationQuestBoardItem, accept_organization_quest, list_organization_quests,
)
from backend.api.quest_assignment_routes import timed_current_uid
from backend.quests.quest_contracts import AssignQuestResponse
from backend.quests.quest_generation import get_destination_resolver

router = APIRouter(tags=["Organization quests"])


@router.get(
    "/organization-quests",
    response_model=List[OrganizationQuestBoardItem],
    summary="List published organization quests",
)
def organization_quest_board(response: Response, db=Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return list_organization_quests(db)


@router.post(
    "/organization-quests/{organization_id}/{quest_id}/accept",
    response_model=AssignQuestResponse,
    status_code=201,
    summary="Generate and accept an organization quest",
    responses={
        404: {"description": "Organization quest is not published or does not exist"},
        409: {"description": "This organization quest is already active"},
        429: {"description": "No active quest slots are available"},
        503: {"description": "Generation, destination, or database service unavailable"},
    },
)
def accept_quest(
    organization_id: str,
    quest_id: str,
    request: Request,
    response: Response,
    uid: str = Depends(timed_current_uid),
    resolver=Depends(get_destination_resolver),
    db=Depends(get_db),
):
    result = accept_organization_quest(
        db,
        uid,
        organization_id,
        quest_id,
        resolver,
        timings=getattr(request.state, "quest_timings", None),
    )
    response.headers["Cache-Control"] = "no-store"
    return result
