import os
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from firebase_admin import auth

from backend import firebase_helpers, quest_routes
from backend.quest_completion import CompletionError


class RouteTests(unittest.TestCase):
    def setUp(self):
        # A tiny test app isolates this router from the teammate's startup issue.
        app = FastAPI()
        app.include_router(quest_routes.router)
        self.db = Mock()
        app.dependency_overrides[quest_routes.get_db] = lambda: self.db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.firebase_app = patch.object(firebase_helpers, "get_firebase_app").start()
        self.verify = patch.object(firebase_helpers.auth, "verify_id_token", return_value={
            "uid": "token-owner", "email": "student@ufl.edu", "email_verified": True,
        }).start()
        self.complete = patch.object(quest_routes, "complete_quest", return_value={
            "status": "completed", "xpAwarded": 25,
        }).start()
        self.addCleanup(patch.stopall)
        self.body = {"latitude": 29.65, "longitude": -82.34, "accuracy": 10}
        self.headers = {"Authorization": "Bearer signed-id-token"}

    def post(self, body=None, headers=None):
        return self.client.post("/quests/quest/complete", json=self.body if body is None else body,
                                headers=self.headers if headers is None else headers)

    def test_verified_token_uid_and_server_configuration_are_forwarded(self):
        with patch.dict(os.environ, {"MAX_LOCATION_ACCURACY_METERS": "35"}):
            self.assertEqual(self.post().status_code, 200)
        self.verify.assert_called_once_with("signed-id-token", check_revoked=True)
        self.complete.assert_called_once_with(self.db, "token-owner", "quest", 29.65, -82.34, 10, 35)

    def test_missing_or_wrong_auth_scheme(self):
        for headers in [{}, {"Authorization": "Basic abc"}]:
            self.assertEqual(self.post(headers=headers).status_code, 401)
        self.verify.assert_not_called()
        self.complete.assert_not_called()

    def test_invalid_expired_revoked_or_disabled_token(self):
        for error_class in [auth.InvalidIdTokenError, auth.ExpiredIdTokenError,
                            auth.RevokedIdTokenError, auth.UserDisabledError]:
            with self.subTest(error=error_class):
                self.verify.side_effect = (error_class("Rejected token", None)
                                           if error_class is auth.ExpiredIdTokenError
                                           else error_class("Rejected token"))
                self.assertEqual(self.post().status_code, 401)
        self.complete.assert_not_called()

    def test_certificate_failure_is_temporary(self):
        self.verify.side_effect = auth.CertificateFetchError("Unavailable", None)
        self.assertEqual(self.post().status_code, 503)

    def test_uf_email_must_be_verified_and_exact_domain(self):
        for email, verified in [("student@ufl.edu", False), ("student@ufl.edu", "true"),
                                ("student@ufl.edu.evil.com", True), ("student@gmail.com", True),
                                ("ufl.edu", True), (None, True)]:
            self.verify.return_value = {"uid": "student", "email": email, "email_verified": verified}
            self.assertEqual(self.post().status_code, 403)
        self.complete.assert_not_called()

    def test_uppercase_domain_is_allowed(self):
        self.verify.return_value["email"] = "Student@UFL.EDU"
        self.assertEqual(self.post().status_code, 200)

    def test_request_cannot_select_uid_dorm_xp_or_radius(self):
        for field, value in [("userId", "other"), ("uid", "other"), ("dormId", "other"),
                             ("xpReward", 99999), ("radiusMeters", 99999), ("max_accuracy", 1000)]:
            self.assertEqual(self.post(body={**self.body, field: value}).status_code, 422)
        self.complete.assert_not_called()

    def test_invalid_request_locations(self):
        for field, value in [("latitude", True), ("latitude", "29.65"), ("latitude", 91),
                             ("longitude", -181), ("accuracy", 0), ("accuracy", -5),
                             ("accuracy", "10"), ("accuracy", None)]:
            self.assertEqual(self.post(body={**self.body, field: value}).status_code, 422)
        self.assertEqual(self.post(body={}).status_code, 422)
        self.complete.assert_not_called()

    def test_malformed_server_accuracy_configuration(self):
        for maximum in ["nan", "inf", "0", "-1", "bad"]:
            with patch.dict(os.environ, {"MAX_LOCATION_ACCURACY_METERS": maximum}):
                self.assertEqual(self.post().status_code, 500)
        self.complete.assert_not_called()

    def test_completion_error_status_and_details_preserved(self):
        self.complete.side_effect = CompletionError(409, "This quest is not currently assigned.")
        response = self.post()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "This quest is not currently assigned.")

    def test_my_quests_filters_status(self):
        assigned, completed = Mock(), Mock()
        assigned.id, completed.id = "a", "b"
        assigned.to_dict.return_value = {"status": "assigned"}
        completed.to_dict.return_value = {"status": "completed"}
        self.db.collection.return_value.where.return_value.stream.return_value = [assigned, completed]
        response = self.client.get("/me/quests?status=assigned", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"quests": [{"status": "assigned", "id": "a"}]})

    def test_quest_catalog_does_not_expose_other_users_generated_content(self):
        own, other, legacy = Mock(), Mock(), Mock()
        for item, name, owner in [(own, "own", "token-owner"), (other, "other", "someone-else"),
                                  (legacy, "legacy", None)]:
            item.id = name
            item.to_dict.return_value = {"isActive": True, **({"ownerId": owner} if owner else {})}
        self.db.collection.return_value.where.return_value.stream.return_value = [own, other, legacy]
        result = self.client.get("/quests", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual([q["id"] for q in result.json()["quests"]], ["own", "legacy"])

    def test_other_users_private_quest_returns_404(self):
        snapshot = self.db.collection.return_value.document.return_value.get.return_value
        snapshot.exists = True
        snapshot.to_dict.return_value = {"isActive": True, "ownerId": "someone-else"}
        result = self.client.get("/quests/another-quest", headers=self.headers)
        self.assertEqual(result.status_code, 404)


if __name__ == "__main__":
    unittest.main()
