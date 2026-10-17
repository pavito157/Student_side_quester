"""Task 3 tests use the real application and mock only Firebase verification."""

import json
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from firebase_admin import auth

from backend import firebase_helpers
from backend.quest_contracts import QuestPreviewResponse
from main import app


class QuestAssignmentPreviewTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.addCleanup(patch.stopall)
        patch.object(firebase_helpers, "get_firebase_app").start()
        self.verify = patch.object(firebase_helpers.auth, "verify_id_token", return_value={
            "uid": "user_token_owner", "email": "student@ufl.edu", "email_verified": True,
        }).start()
        self.body = json.loads((Path(__file__).resolve().parents[1] / "contracts" /
                                "assignment.request.example.json").read_text())
        self.headers = {"Authorization": "Bearer firebase-id-token"}

    def post(self, body=None):
        return self.client.post("/quests/preview", json=self.body if body is None else body,
                                headers=self.headers)

    def test_authenticated_request_returns_explicitly_unsaved_test_quest(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.text)
        result = QuestPreviewResponse.model_validate(response.json())
        self.assertEqual(result.mode, "test")
        self.assertFalse(result.saved)
        self.assertFalse(result.filtersApplied)
        self.assertEqual(result.normalizedPreferences.time.minMinutes, 120)
        self.assertEqual(result.normalizedPreferences.budget.minDollars, 10)
        self.assertEqual(result.normalizedPreferences.budget.maxDollars, 25)
        self.assertNotIn("assignment", response.json())
        self.assertNotIn("id", response.json()["quest"])
        self.assertNotIn("xpReward", response.json()["quest"])
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.verify.assert_called_once_with("firebase-id-token", check_revoked=True)

    def test_missing_invalid_or_non_uf_identity_is_rejected(self):
        self.assertEqual(self.client.post("/quests/preview", json=self.body).status_code, 401)
        self.verify.assert_not_called()
        self.verify.side_effect = auth.InvalidIdTokenError("Not an ID token")
        self.assertEqual(self.post().status_code, 401)
        self.verify.side_effect = None
        for email, verified in [("student@gmail.com", False), ("student@ufl.edu", False)]:
            self.verify.return_value = {"uid": "user_token_owner", "email": email, "email_verified": verified}
            self.assertEqual(self.post().status_code, 403)

    def test_no_firestore_or_completion_access(self):
        with patch.object(firebase_helpers, "get_db", side_effect=AssertionError("No database access")), \
                patch.object(firebase_helpers.firestore, "client", side_effect=AssertionError("No Firestore client")), \
                patch("backend.quest_completion.complete_quest", side_effect=AssertionError("No completion")):
            self.assertEqual(self.post().status_code, 200)
            self.assertEqual(self.post().status_code, 200)

    def test_personalization_does_not_change_the_fixed_test_quest(self):
        first = self.post().json()
        second = self.post({**self.body, "preferences": "Art", "goals": ["Relax"],
                            "time": {"selection": "30"}, "budget": {"selection": "0"}}).json()
        self.assertEqual(first["quest"], second["quest"])
        self.assertNotEqual(first["normalizedPreferences"], second["normalizedPreferences"])
        self.assertFalse(second["filtersApplied"])

    def test_distance_and_activity_time_are_independent(self):
        result = self.post({**self.body, "distance": 2.5, "time": {
            "selection": "custom", "customMinutes": 45}}).json()
        self.assertEqual(result["normalizedPreferences"]["maxDistanceMiles"], 2.5)
        self.assertEqual(result["normalizedPreferences"]["time"]["maxMinutes"], 45)
        self.assertFalse(result["filtersApplied"])

    def test_invalid_custom_time_budget_and_distance_get_field_errors(self):
        for change in [{"time": {"selection": "custom", "customMinutes": "45"}},
                       {"budget": {"selection": "custom", "customDollars": -1}},
                       {"distance": "2.5"}, {"distance": 0},
                       {"location": "Anywhere", "distance": 2.5}]:
            with self.subTest(change=change):
                response = self.post({**self.body, **change})
                self.assertEqual(response.status_code, 422)
                self.assertIsInstance(response.json()["detail"], list)

    def test_identity_reward_and_status_in_body_cannot_bypass_token(self):
        for field, value in [("uid", "another-user"), ("userId", "another-user"),
                             ("xpReward", 5000), ("status", "completed")]:
            self.assertEqual(self.post({**self.body, field: value}).status_code, 422)
        result = self.post({**self.body, "username": "Someone else"}).json()
        self.assertNotIn("username", result["normalizedPreferences"])
        self.assertNotIn("userId", result)

    def test_no_location_or_personalization_can_still_preview(self):
        result = self.post({"location": "Anywhere", "time": {}, "budget": {}})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["normalizedPreferences"]["location"], {"mode": "anywhere"})

    def test_swagger_documents_the_real_request_and_preview_schema(self):
        self.assertEqual(self.client.get("/docs").status_code, 200)
        schema = self.client.get("/openapi.json").json()
        operation = schema["paths"]["/quests/preview"]["post"]
        self.assertTrue(operation["security"])
        self.assertIn("not saved", operation["summary"])
        request = operation["requestBody"]["content"]["application/json"]
        self.assertTrue(request["schema"]["$ref"].endswith("AssignQuestRequest"))
        self.assertEqual(request["examples"]["frontend"]["value"]["time"]["selection"], "120")
        response = operation["responses"]["200"]["content"]["application/json"]["schema"]
        self.assertTrue(response["$ref"].endswith("QuestPreviewResponse"))

    def test_request_body_not_mutated_by_normalization(self):
        before = deepcopy(self.body)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.body, before)


if __name__ == "__main__":
    unittest.main()
