"""Policy, orchestration and real API contracts; no production Firebase/AI calls."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.auth import firebase_helpers
from backend.quests import quest_persistence as persistence
from backend.quests.quest_contracts import (
    AssignQuestResponse, GenerateQuestRequest, GeneratedQuestProposal, GeneratedQuestResponse,
    ResolvedDestination,
)
from main import app


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.body = {"location": "Anywhere", "time": {"selection": "60"},
                     "budget": {"selection": "0"}, "preferences": "Nature"}
        self.user_request = GenerateQuestRequest.model_validate(self.body)
        self.preferences = self.user_request.normalize()
        data = json.loads((Path(__file__).resolve().parents[1] / "contracts" /
                           "assignment.response.example.json").read_text())
        data["quest"]["id"] = "saved-quest"
        data["assignment"].update(userId="user_student", questId="saved-quest",
                                  id="user_student_saved-quest", assignedAt=datetime.now(timezone.utc))
        self.saved = AssignQuestResponse.model_validate(data)
        self.addCleanup(patch.stopall)

    def test_policy_defaults_and_configuration(self):
        with patch.dict(os.environ, {"QUEST_RADIUS_METERS": "100"}):
            self.assertEqual(persistence.get_assignment_policy().model_dump(),
                             {"radiusMeters": 100})
        with patch.dict(os.environ, {"QUEST_RADIUS_METERS": "75.5"}):
            self.assertEqual(persistence.get_assignment_policy().radiusMeters, 75.5)

    def test_saved_requests_preserve_legacy_and_explicit_vibe_selection(self):
        for changes, expected in [
            ({'vibePreferences': 'Legacy energetic break'}, 'Legacy energetic break'),
            ({'activeVibe': None, 'vibePreferences': 'Inactive old vibe'}, None),
            ({'activeVibe': {'name': 'Study Break', 'preferences': 'Affordable games'}}, 'Affordable games'),
        ]:
            with self.subTest(changes=changes):
                request = GenerateQuestRequest.model_validate({**self.body, **changes})
                stored = persistence._sidequest_data(self.saved, request)['userRequest']
                restored = GenerateQuestRequest.model_validate(stored).normalize()
                self.assertEqual(restored.vibe.preferences if restored.vibe else None, expected)
                if expected == 'Affordable games':
                    self.assertEqual(restored.vibe.name, 'Study Break')

    def test_invalid_policy_is_rejected(self):
        for key, values in {"QUEST_RADIUS_METERS": ["0", "-1", "nan", "inf", "invalid"]}.items():
            for value in values:
                with self.subTest(key=key, value=value), patch.dict(os.environ, {key: value}):
                    with self.assertRaises(HTTPException) as caught:
                        persistence.get_assignment_policy()
                    self.assertEqual(caught.exception.status_code, 503)

    def test_three_active_quests_reject_before_ai_resolver_policy_or_save(self):
        with patch.object(persistence, "get_active_assignments", return_value=[self.saved] * 3), \
                patch.object(persistence, "generate_preview") as provider, \
                patch.object(persistence, "get_assignment_policy") as policy, \
                patch.object(persistence, "save_verified_assignment") as save:
            with self.assertRaises(HTTPException) as caught:
                persistence.assign_generated_quest(MagicMock(), "user_student", self.preferences, None)
            self.assertEqual(caught.exception.status_code, 429)
            provider.assert_not_called()
            policy.assert_not_called()
            save.assert_not_called()

    def test_missing_resolver_fails_without_paid_generation_or_save(self):
        with patch.object(persistence, "get_active_assignments", return_value=[]), \
                patch.object(persistence, "generate_preview") as provider, \
                patch.object(persistence, "save_verified_assignment") as save:
            with self.assertRaises(HTTPException) as caught:
                persistence.assign_generated_quest(MagicMock(), "user_student", self.preferences, None)
            self.assertEqual(caught.exception.status_code, 503)
            provider.assert_not_called()
            save.assert_not_called()

    def test_generation_error_never_saves_and_remains_actionable(self):
        with patch.object(persistence, "get_active_assignments", return_value=[]), \
                patch.object(persistence, "generate_preview", side_effect=HTTPException(429, "Quota reached")), \
                patch.object(persistence, "save_verified_assignment") as save:
            with self.assertRaises(HTTPException) as caught:
                persistence.assign_generated_quest(MagicMock(), "user_student", self.preferences, MagicMock())
            self.assertEqual(caught.exception.status_code, 429)
            save.assert_not_called()

    def test_invalid_uid_never_accesses_database(self):
        db = MagicMock()
        for uid in [None, "", "bad/id", "x" * 129]:
            with self.assertRaises(HTTPException):
                persistence.get_current_assignment(db, uid)
        db.collection.assert_not_called()

    def test_replacement_requires_displayed_current_quest_before_paid_generation(self):
        with patch.object(persistence, "get_active_assignments", return_value=[self.saved]), \
                patch.object(persistence, "generate_preview") as provider:
            with self.assertRaises(HTTPException) as caught:
                persistence.replace_generated_quest(MagicMock(), "user_student", "stale", self.preferences, MagicMock())
            self.assertEqual(caught.exception.status_code, 409)
            provider.assert_not_called()

    def test_legacy_replacement_count_does_not_block_free_active_slots(self):
        current = self.saved.model_copy(update={
            "assignment": self.saved.assignment.model_copy(update={"replacementCount": 3}),
        })
        with patch.object(persistence, "get_active_assignments", return_value=[current]), \
                patch.object(persistence, "generate_preview", return_value="preview") as provider, \
                patch.object(persistence, "save_verified_assignment", return_value=self.saved) as save:
            result = persistence.add_generated_quest(MagicMock(), "user_student", current.quest.id, self.preferences, MagicMock())
            self.assertEqual(result, self.saved)
            self.assertEqual(provider.call_args.kwargs["previous_quest"], current.quest)
            self.assertEqual(save.call_args.kwargs["source_quest_id"], current.quest.id)

    def test_replacement_failure_never_saves_or_skips(self):
        with patch.object(persistence, "get_active_assignments", return_value=[self.saved]), \
                patch.object(persistence, "generate_preview", side_effect=HTTPException(504, "Timeout")), \
                patch.object(persistence, "save_verified_assignment") as save:
            with self.assertRaises(HTTPException) as caught:
                persistence.replace_generated_quest(MagicMock(), "user_student", self.saved.quest.id, self.preferences, MagicMock())
            self.assertEqual(caught.exception.status_code, 504)
            save.assert_not_called()


    def test_missing_destination_pointer_is_cleared_when_no_assignment_exists(self):
        db = MagicMock()
        transaction = MagicMock()
        user_ref = db.collection.return_value.document.return_value
        sidequest_collection = MagicMock()
        sidequest_collection.stream.return_value = []

        with patch.object(persistence, "sidequests", return_value=sidequest_collection), \
                patch.object(persistence, "ASSIGNMENTS", "userQuests"):
            result = persistence._read_active(
                db, transaction, "user_student", {"activeQuestId": "missing-quest"},
            )

        self.assertIsNone(result)
        transaction.update.assert_called_once()
        updated_ref, changes = transaction.update.call_args.args
        self.assertEqual(updated_ref, user_ref)
        self.assertEqual(changes, {"activeQuestId": persistence.firestore.DELETE_FIELD, "activeQuestSchemaVersion": 2})

    def test_generated_content_and_duration_reward_are_saved_to_user_sidequest(self):
        preview = GeneratedQuestResponse(
            filtersApplied=True, destinationVerified=True, distanceStatus="not_requested",
            message="Verified quest preview",
            quest=GeneratedQuestProposal(
                title="Sketch local leaves", description="Draw three distinct leaves.",
                steps=["Find three leaves.", "Sketch each leaf."], locationName="Gemini suggestion",
                locationAddress="Unverified Gemini address", estimatedMinutes=31,
                estimatedCostDollars=2,
            ),
            destination=ResolvedDestination(
                locationName="Verified park", latitude=29.65, longitude=-82.34,
                placeId="verified-place", scope="gainesville_city",
            ),
            normalizedPreferences=self.preferences,
        )
        db = MagicMock()
        user_ref = db.collection.return_value.document.return_value
        user_ref.get.return_value.exists = True
        user_ref.get.return_value.to_dict.return_value = {}
        db.collection.return_value.document.return_value.collection.return_value.stream.return_value = []
        db.collection.return_value.where.return_value.stream.return_value = []
        transaction = MagicMock()

        with patch.object(persistence, "_run_transaction",
                          side_effect=lambda _db, callback: callback(transaction)):
            result = persistence.save_verified_assignment(
                db, "user_student", preview, persistence.AssignmentPolicy(), self.user_request,
            )

        saved = transaction.create.call_args.args[1]
        self.assertEqual(result.quest.xpReward, 15)
        self.assertEqual(saved["title"], preview.quest.title)
        self.assertEqual(saved["description"], preview.quest.description)
        self.assertEqual(saved["steps"], preview.quest.steps)
        self.assertEqual(saved["estimatedMinutes"], 31)
        self.assertEqual(saved["estimatedCostDollars"], 2)
        self.assertEqual(saved["locationName"], "Verified park")
        self.assertEqual(saved["placeId"], "verified-place")
        self.assertNotIn("locationAddress", saved)
        self.assertEqual(saved["ownerId"], "user_student")
        self.assertEqual(saved["xpReward"], 15)
        self.assertEqual(saved["status"], "assigned")
        self.assertEqual(saved["xpAwarded"], 0)
        self.assertEqual(saved["userRequest"], self.user_request.model_dump(mode="json", exclude={"activeVibe"}))


class PersistenceRouteTests(unittest.TestCase):
    def setUp(self):
        PersistenceTests.setUp(self)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        patch.object(firebase_helpers, "get_firebase_app").start()
        self.verify = patch.object(firebase_helpers.auth, "verify_id_token", return_value={
            "uid": "user_student", "email": "student@ufl.edu", "email_verified": True,
        }).start()
        self.db = patch("backend.api.quest_assignment_routes.get_db", return_value=MagicMock()).start()
        self.assign = patch("backend.api.quest_assignment_routes.assign_generated_quest",
                            return_value=self.saved).start()
        self.read = patch("backend.api.quest_assignment_routes.get_current_assignment", return_value=None).start()
        self.replace = patch("backend.api.quest_assignment_routes.replace_generated_quest", return_value=self.saved).start()
        self.headers = {"Authorization": "Bearer firebase-test-token"}

    def test_new_assignment_is_201_with_structured_json_and_token_identity(self):
        response = self.client.post("/quests/assign", json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.text)
        parsed = AssignQuestResponse.model_validate(response.json())
        self.assertEqual(parsed.assignment.userId, "user_student")
        self.assertEqual(parsed.assignment.xpAwarded, 0)
        self.assertFalse(parsed.reusedExisting)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertIn("auth;dur=", response.headers["server-timing"])
        self.assign.assert_called_once()
        self.assertEqual(self.assign.call_args.args[1], "user_student")
        self.assertEqual(self.assign.call_args.kwargs["user_request"], self.user_request)
        self.verify.assert_called_once_with("firebase-test-token", check_revoked=True)

    def test_active_list_is_authenticated_and_uses_token_owner(self):
        with patch("backend.api.quest_assignment_routes.get_active_assignments", return_value=[self.saved]) as read:
            response = self.client.get("/me/active-quests", headers=self.headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(response.json()[0]["quest"]["id"], self.saved.quest.id)
            self.assertEqual(read.call_args.args[1], "user_student")
            read.reset_mock()
            self.assertEqual(self.client.get("/me/active-quests").status_code, 401)
            read.assert_not_called()
        self.read.return_value = self.saved.model_copy(update={"reusedExisting": True})
        self.assertTrue(self.client.get("/me/quest", headers=self.headers).json()["reusedExisting"])

    def test_no_active_assignment_is_json_null(self):
        response = self.client.get("/me/quest", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json())

    def test_missing_or_unverified_identity_is_rejected_before_database(self):
        self.assertEqual(self.client.post("/quests/assign", json=self.body).status_code, 401)
        self.assertEqual(self.client.get("/me/quest").status_code, 401)
        self.db.assert_not_called()
        self.verify.return_value.update(email="student@gmail.com", email_verified=False)
        self.assertEqual(self.client.post("/quests/assign", json=self.body, headers=self.headers).status_code, 403)
        self.db.assert_not_called()
        self.assign.assert_not_called()

    def test_trusted_fields_are_not_accepted_from_frontend(self):
        for field in ["uid", "userId", "ownerId", "xpReward", "radiusMeters", "questId", "status", "replacementCount"]:
            response = self.client.post("/quests/assign", json={**self.body, field: "untrusted"}, headers=self.headers)
            self.assertEqual(response.status_code, 422)
        self.assign.assert_not_called()

    def test_resolver_and_database_failures_keep_error_status(self):
        for status in [409, 429, 502, 503, 504]:
            self.assign.side_effect = HTTPException(status, "Cannot assign")
            response = self.client.post("/quests/assign", json=self.body, headers=self.headers)
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.json()["detail"], "Cannot assign")

    def test_replacement_uses_token_uid_path_id_and_same_response_contract(self):
        result = self.client.post("/quests/old-quest/replace", json=self.body, headers=self.headers)
        self.assertEqual(result.status_code, 201, result.text)
        AssignQuestResponse.model_validate(result.json())
        self.assertEqual(result.headers["cache-control"], "no-store")
        self.assertEqual(self.replace.call_args.args[1:3], ("user_student", "old-quest"))
        self.assertEqual(self.replace.call_args.args[3], self.preferences)
        self.assertEqual(self.client.post("/quests/old-quest/replace", json=self.body).status_code, 401)
        for field in ["userId", "xpReward", "status", "replacementCount"]:
            self.assertEqual(self.client.post("/quests/old-quest/replace", json={**self.body, field: "bad"}, headers=self.headers).status_code, 422)

    def test_openapi_documents_distinct_saved_and_preview_contracts(self):
        schema = self.client.get("/openapi.json").json()
        post = schema["paths"]["/quests/assign"]["post"]
        for code in ["201"]:
            self.assertTrue(post["responses"][code]["content"]["application/json"]["schema"]["$ref"].endswith("AssignQuestResponse"))
        self.assertIn("/quests/preview", schema["paths"])
        self.assertIn("/quests/{quest_id}/complete", schema["paths"])
        self.assertIn("/quests/{quest_id}/abandon", schema["paths"])


if __name__ == "__main__":
    unittest.main()
