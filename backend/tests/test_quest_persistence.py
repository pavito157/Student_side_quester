"""Policy, orchestration and real API contracts; no production Firebase/AI calls."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import firebase_helpers, quest_persistence as persistence
from backend.quest_contracts import AssignQuestResponse, GenerateQuestRequest
from main import app


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.body = {"location": "Anywhere", "time": {"selection": "60"},
                     "budget": {"selection": "0"}, "preferences": "Nature"}
        self.preferences = GenerateQuestRequest.model_validate(self.body).normalize()
        data = json.loads((Path(__file__).resolve().parents[1] / "contracts" /
                           "assignment.response.example.json").read_text())
        data["quest"]["id"] = "saved-quest"
        data["assignment"].update(userId="user_student", questId="saved-quest",
                                  id="user_student_saved-quest", assignedAt=datetime.now(timezone.utc))
        self.saved = AssignQuestResponse.model_validate(data)
        self.addCleanup(patch.stopall)

    def test_policy_defaults_and_configuration(self):
        with patch.dict(os.environ, {"QUEST_XP_REWARD": "25", "QUEST_RADIUS_METERS": "100"}):
            self.assertEqual(persistence.get_assignment_policy().model_dump(),
                             {"xpReward": 25, "radiusMeters": 100})
        with patch.dict(os.environ, {"QUEST_XP_REWARD": "40", "QUEST_RADIUS_METERS": "75.5"}):
            self.assertEqual(persistence.get_assignment_policy().xpReward, 40)
            self.assertEqual(persistence.get_assignment_policy().radiusMeters, 75.5)

    def test_invalid_policy_is_rejected(self):
        for key, values in {"QUEST_XP_REWARD": ["-1", "1.5", "true", str(2**53)],
                            "QUEST_RADIUS_METERS": ["0", "-1", "nan", "inf", "invalid"]}.items():
            for value in values:
                with self.subTest(key=key, value=value), patch.dict(os.environ, {key: value}):
                    with self.assertRaises(HTTPException) as caught:
                        persistence.get_assignment_policy()
                    self.assertEqual(caught.exception.status_code, 503)

    def test_existing_assignment_bypasses_ai_resolver_policy_and_save(self):
        existing = self.saved.model_copy(update={"reusedExisting": True})
        with patch.object(persistence, "get_current_assignment", return_value=existing), \
                patch.object(persistence, "generate_preview") as provider, \
                patch.object(persistence, "get_assignment_policy") as policy, \
                patch.object(persistence, "save_verified_assignment") as save:
            self.assertEqual(persistence.assign_generated_quest(MagicMock(), "user_student",
                                                               self.preferences, None), existing)
            provider.assert_not_called()
            policy.assert_not_called()
            save.assert_not_called()

    def test_missing_resolver_fails_without_paid_generation_or_save(self):
        with patch.object(persistence, "get_current_assignment", return_value=None), \
                patch.object(persistence, "generate_preview") as provider, \
                patch.object(persistence, "save_verified_assignment") as save:
            with self.assertRaises(HTTPException) as caught:
                persistence.assign_generated_quest(MagicMock(), "user_student", self.preferences, None)
            self.assertEqual(caught.exception.status_code, 503)
            provider.assert_not_called()
            save.assert_not_called()

    def test_generation_error_never_saves_and_remains_actionable(self):
        with patch.object(persistence, "get_current_assignment", return_value=None), \
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
        with patch.object(persistence, "get_current_assignment", return_value=self.saved), \
                patch.object(persistence, "generate_preview") as provider:
            with self.assertRaises(HTTPException) as caught:
                persistence.replace_generated_quest(MagicMock(), "user_student", "stale", self.preferences, MagicMock())
            self.assertEqual(caught.exception.status_code, 409)
            provider.assert_not_called()

    def test_replacement_failure_never_saves_or_skips(self):
        with patch.object(persistence, "get_current_assignment", return_value=self.saved), \
                patch.object(persistence, "generate_preview", side_effect=HTTPException(504, "Timeout")), \
                patch.object(persistence, "save_verified_assignment") as save:
            with self.assertRaises(HTTPException) as caught:
                persistence.replace_generated_quest(MagicMock(), "user_student", self.saved.quest.id, self.preferences, MagicMock())
            self.assertEqual(caught.exception.status_code, 504)
            save.assert_not_called()



class PersistenceRouteTests(unittest.TestCase):
    def setUp(self):
        PersistenceTests.setUp(self)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        patch.object(firebase_helpers, "get_firebase_app").start()
        self.verify = patch.object(firebase_helpers.auth, "verify_id_token", return_value={
            "uid": "user_student", "email": "student@ufl.edu", "email_verified": True,
        }).start()
        self.db = patch("backend.quest_assignment_routes.get_db", return_value=MagicMock()).start()
        self.assign = patch("backend.quest_assignment_routes.assign_generated_quest",
                            return_value=self.saved).start()
        self.read = patch("backend.quest_assignment_routes.get_current_assignment", return_value=None).start()
        self.replace = patch("backend.quest_assignment_routes.replace_generated_quest", return_value=self.saved).start()
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
        self.verify.assert_called_once_with("firebase-test-token", check_revoked=True)

    def test_existing_assignment_is_200_and_get_reloads_same_contract(self):
        reused = self.saved.model_copy(update={"reusedExisting": True})
        self.assign.return_value = self.read.return_value = reused
        post = self.client.post("/quests/assign", json=self.body, headers=self.headers)
        get = self.client.get("/me/quest", headers=self.headers)
        self.assertEqual(post.status_code, 200)
        self.assertEqual(get.status_code, 200)
        self.assertEqual(post.json(), get.json())

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
        for field in ["uid", "userId", "ownerId", "xpReward", "radiusMeters", "questId", "status"]:
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
        for field in ["userId", "xpReward", "status"]:
            self.assertEqual(self.client.post("/quests/old-quest/replace", json={**self.body, field: "bad"}, headers=self.headers).status_code, 422)

    def test_openapi_documents_distinct_saved_and_preview_contracts(self):
        schema = self.client.get("/openapi.json").json()
        post = schema["paths"]["/quests/assign"]["post"]
        for code in ["200", "201"]:
            self.assertTrue(post["responses"][code]["content"]["application/json"]["schema"]["$ref"].endswith("AssignQuestResponse"))
        self.assertIn("/quests/preview", schema["paths"])
        self.assertIn("/quests/{quest_id}/complete", schema["paths"])


if __name__ == "__main__":
    unittest.main()
