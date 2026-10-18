"""Organization board visibility, generated acceptance, and duplicate protection."""

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.auth import firebase_helpers
from backend.api import organization_quest_routes
from backend.organizations import organization_quests
from backend.organizations.organization_quests import StoredOrganizationQuest
from backend.quests.quest_contracts import AssignQuestResponse, AssignedQuest, SavedAssignment
from backend.quests.quest_persistence import _check_organization_duplicate


ORGANIZATION_ID = "community"
ORGANIZATION_NAME = "Community Organization"
QUEST_ID = "public-challenge"
QUEST_REQUEST = {
    "location": "Anywhere",
    "time": {"selection": "60"},
    "budget": {"selection": "0"},
    "preferences": "Explore a public local place and complete a simple creative activity.",
    "goals": ["Explore local places"],
    "vibePreferences": "Curious and creative",
    "multiQuest": False,
    "proofOptions": ["location", "photo"],
}
QUEST_RECORD = {
    "title": "A public challenge",
    "summary": "Explore a public place.",
    "details": "Notice something interesting and document it.",
    "published": True,
    "questRequest": QUEST_REQUEST,
}


class Snapshot:
    def __init__(self, path, data, exists=True):
        self.reference = SimpleNamespace(path=path)
        self.id = path.rsplit("/", 1)[-1]
        self._data = data
        self.exists = exists

    def to_dict(self):
        return self._data


class CollectionGroup:
    def __init__(self, snapshots):
        self.snapshots = snapshots

    def stream(self, timeout):
        return iter(self.snapshots)


class FakeOrganizationDb:
    def __init__(self, quest_snapshots, organizations):
        self.quest_snapshots = quest_snapshots
        self.organizations = organizations

    def collection_group(self, name):
        if name != "quests":
            raise AssertionError(name)
        return CollectionGroup(self.quest_snapshots)

    def collection(self, name):
        if name != "Organizations":
            raise AssertionError(name)
        return OrganizationCollection(self.organizations)


class OrganizationCollection:
    def __init__(self, organizations):
        self.organizations = organizations

    def document(self, organization_id):
        return OrganizationDocument(self.organizations, organization_id)


class OrganizationDocument:
    def __init__(self, organizations, organization_id):
        self.organizations = organizations
        self.organization_id = organization_id

    def get(self, timeout=10):
        data = self.organizations.get(self.organization_id)
        return Snapshot(f"Organizations/{self.organization_id}", data, data is not None)

    def collection(self, subcollection):
        if subcollection != "quests":
            raise AssertionError(subcollection)
        return QuestCollection(self.organizations, self.organization_id)


class QuestCollection:
    def __init__(self, organizations, organization_id):
        self.organizations = organizations
        self.organization_id = organization_id

    def document(self, quest_id):
        return QuestDocument(self.organizations, self.organization_id, quest_id)


class QuestDocument:
    def __init__(self, organizations, organization_id, quest_id):
        self.organizations = organizations
        self.organization_id = organization_id
        self.quest_id = quest_id

    def get(self, timeout=10):
        organization = self.organizations.get(self.organization_id, {})
        quest = organization.get("quests", {}).get(self.quest_id)
        path = f"Organizations/{self.organization_id}/quests/{self.quest_id}"
        return Snapshot(path, quest, quest is not None)


class OrganizationQuestTests(unittest.TestCase):
    def setUp(self):
        self.quest = QUEST_RECORD
        self.organization = {"name": ORGANIZATION_NAME, "isPublic": True}
        self.org_id = ORGANIZATION_ID
        self.quest_id = QUEST_ID
        self.public_snapshot = Snapshot(
            f"Organizations/{self.org_id}/quests/{self.quest_id}",
            {**self.quest, "privateInternalNote": "never returned"},
        )
        self.db = FakeOrganizationDb(
            [self.public_snapshot],
            {self.org_id: {**self.organization, "secret": "never returned"}},
        )

    def test_public_board_returns_only_published_allowlisted_fields(self):
        unpublished = Snapshot(
            "Organizations/private/quests/draft",
            {**self.quest, "published": False, "title": "Hidden"},
        )
        self.db.quest_snapshots.extend([unpublished, Snapshot("Other/quests/ignored", self.quest)])
        self.db.organizations["private"] = {"name": "Private Organization", "isPublic": False}
        self.db.quest_snapshots.append(Snapshot(
            "Organizations/private/quests/private-quest", self.quest,
        ))
        result = organization_quests.list_organization_quests(self.db)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].organizationId, self.org_id)
        self.assertEqual(result[0].organizationName, self.organization["name"])
        self.assertEqual(result[0].questId, self.quest_id)
        self.assertEqual(result[0].timeLabel, "Up to 60 minutes")
        self.assertNotIn("privateInternalNote", result[0].model_dump())
        self.assertNotIn("questRequest", result[0].model_dump())
        self.assertNotIn("secret", result[0].model_dump())

    def test_unpublished_quest_cannot_be_loaded_for_acceptance(self):
        self.db.organizations[self.org_id]["quests"] = {
            self.quest_id: {**self.quest, "published": False},
        }
        with self.assertRaises(HTTPException) as caught:
            organization_quests.get_organization_quest(self.db, self.org_id, self.quest_id)
        self.assertEqual(caught.exception.status_code, 404)

    def test_published_malformed_request_is_reported_as_service_error(self):
        self.db.quest_snapshots[0] = Snapshot(
            self.public_snapshot.reference.path,
            {**self.quest, "questRequest": {"location": "Anywhere"}},
        )
        with self.assertRaises(HTTPException) as caught:
            organization_quests.list_organization_quests(self.db)
        self.assertEqual(caught.exception.status_code, 503)

    def test_accept_generates_from_org_request_and_saves_source_provenance(self):
        stored = StoredOrganizationQuest.model_validate(self.quest)
        active = []
        preview = object()
        policy = object()
        saved = object()
        with patch.object(organization_quests, "get_organization_quest", return_value=stored), \
                patch.object(organization_quests, "get_active_assignments", return_value=active), \
                patch.object(organization_quests, "generate_preview", return_value=preview) as generate, \
                patch.object(organization_quests, "get_assignment_policy", return_value=policy), \
                patch.object(organization_quests, "save_verified_assignment", return_value=saved) as persist:
            result = organization_quests.accept_organization_quest(
                self.db, "student-1", self.org_id, self.quest_id, resolver=object(),
            )

        self.assertIs(result, saved)
        preferences, resolver = generate.call_args.args[:2]
        self.assertEqual(preferences.preferences, self.quest["questRequest"]["preferences"])
        self.assertIsNotNone(resolver)
        persist.assert_called_once()
        self.assertEqual(persist.call_args.kwargs["source_organization_id"], self.org_id)
        self.assertEqual(persist.call_args.kwargs["source_organization_quest_id"], self.quest_id)

    def test_full_capacity_rejects_before_paid_generation(self):
        stored = StoredOrganizationQuest.model_validate(self.quest)
        active = [SimpleNamespace(quest=SimpleNamespace(
            sourceOrganizationId=None, sourceOrganizationQuestId=None,
        )) for _ in range(3)]
        with patch.object(organization_quests, "get_organization_quest", return_value=stored), \
                patch.object(organization_quests, "get_active_assignments", return_value=active), \
                patch.object(organization_quests, "generate_preview") as generate:
            with self.assertRaises(HTTPException) as caught:
                organization_quests.accept_organization_quest(
                    self.db, "student-1", self.org_id, self.quest_id, resolver=object(),
                )
        self.assertEqual(caught.exception.status_code, 429)
        generate.assert_not_called()

    def test_duplicate_active_organization_quest_is_rejected(self):
        duplicate = SimpleNamespace(quest=SimpleNamespace(
            sourceOrganizationId=self.org_id,
            sourceOrganizationQuestId=self.quest_id,
        ))
        with self.assertRaises(HTTPException) as caught:
            _check_organization_duplicate([duplicate], self.org_id, self.quest_id)
        self.assertEqual(caught.exception.status_code, 409)

    def test_duplicate_is_rejected_before_generation(self):
        stored = StoredOrganizationQuest.model_validate(self.quest)
        active = [SimpleNamespace(quest=SimpleNamespace(
            sourceOrganizationId=self.org_id,
            sourceOrganizationQuestId=self.quest_id,
        ))]
        with patch.object(organization_quests, "get_organization_quest", return_value=stored), \
                patch.object(organization_quests, "get_active_assignments", return_value=active), \
                patch.object(organization_quests, "generate_preview") as generate:
            with self.assertRaises(HTTPException) as caught:
                organization_quests.accept_organization_quest(
                    self.db, "student-1", self.org_id, self.quest_id, resolver=object(),
                )
        self.assertEqual(caught.exception.status_code, 409)
        generate.assert_not_called()


class OrganizationQuestRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(organization_quest_routes.router)
        self.app.dependency_overrides[organization_quest_routes.get_db] = lambda: object()
        self.app.dependency_overrides[organization_quest_routes.get_destination_resolver] = lambda: object()
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.addCleanup(patch.stopall)

    def test_board_is_public(self):
        item = organization_quests.OrganizationQuestBoardItem(
            organizationId="guild",
            organizationName="Community Guild",
            questId="quest-one",
            title="A public challenge",
            summary="A short summary.",
            details="More details.",
            timeLabel="Up to 60 minutes",
        )
        with patch.object(organization_quest_routes, "get_db", return_value=object()), \
                patch.object(organization_quest_routes, "list_organization_quests", return_value=[item]):
            response = self.client.get("/organization-quests")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["questId"], "quest-one")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_accept_requires_authentication(self):
        self.assertEqual(
            self.client.post("/organization-quests/guild/quest-one/accept").status_code,
            401,
        )

    def test_authenticated_accept_returns_saved_assignment_with_provenance(self):
        result = AssignQuestResponse(
            quest=AssignedQuest(
                id="quest-generated",
                sourceOrganizationId="guild",
                sourceOrganizationQuestId="quest-one",
                title="A verified quest",
                description="Notice a pattern at a public place.",
                steps=["Notice three shapes and record what connects them."],
                stepProofMethods=["photo"],
                stepDestinationIndexes=[0],
                locationName="Public Garden",
                placeId="place-id",
                latitude=29.65,
                longitude=-82.34,
                radiusMeters=50.0,
                xpReward=20,
                isActive=True,
                estimatedMinutes=30,
                estimatedCostDollars=0.0,
            ),
            assignment=SavedAssignment(
                id="student-1_quest-generated",
                userId="student-1",
                questId="quest-generated",
                status="assigned",
                assignedAt=datetime.now(timezone.utc),
            ),
            reusedExisting=False,
        )
        with patch.object(firebase_helpers, "get_firebase_app"), \
                patch.object(firebase_helpers.auth, "verify_id_token", return_value={
                    "uid": "student-1", "email": "student@example.com", "email_verified": True,
                }), \
                patch.object(organization_quest_routes, "accept_organization_quest", return_value=result) as accept:
            response = self.client.post(
                "/organization-quests/guild/quest-one/accept",
                headers={"Authorization": "Bearer test-token"},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["quest"]["sourceOrganizationId"], "guild")
        self.assertEqual(response.json()["quest"]["sourceOrganizationQuestId"], "quest-one")
        accept.assert_called_once()
        self.assertEqual(accept.call_args.args[1:4], ("student-1", "guild", "quest-one"))


if __name__ == "__main__":
    unittest.main()
