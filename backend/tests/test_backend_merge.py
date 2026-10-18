"""Verify the backend merge shares Firebase and does not shadow real endpoints."""

import importlib
import re
import unittest
from collections import Counter
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from backend.auth import firebase_helpers
from main import app


class BackendMergeTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(firebase_helpers, "get_firebase_app").start()
        patch.object(firebase_helpers.auth, "verify_id_token", return_value={
            "uid": "user_student", "email": "student@ufl.edu", "email_verified": True,
        }).start()
        self.db = MagicMock()
        app.dependency_overrides[firebase_helpers.get_db] = lambda: self.db
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = {"Authorization": "Bearer firebase-test-token"}

    def test_no_duplicate_or_parameter_renamed_routes(self):
        endpoints = Counter(
            (method.upper(), re.sub(r"\{[^}]+\}", "{}", path))
            for path, methods in app.openapi()["paths"].items()
            for method in methods
        )
        self.assertEqual([key for key, count in endpoints.items() if count > 1], [])
        self.assertIn(("POST", "/quests/assign"), endpoints)
        self.assertIn(("POST", "/quests/{}/complete"), endpoints)
        self.assertIn(("POST", "/quests/{}/abandon"), endpoints)

    def test_placeholders_require_auth_and_return_explicit_not_implemented(self):
        for method, path in [("POST", "/users"), ("GET", "/users/user_student")]:
            self.assertEqual(self.client.request(method, path).status_code, 401)
            self.assertEqual(self.client.request(method, path, headers=self.headers).status_code, 501)
        self.db.collection.assert_not_called()

    def test_leaderboards_require_authentication(self):
        self.assertEqual(self.client.get("/leaderboard").status_code, 401)
        self.assertEqual(self.client.get("/leaderboard/dorms").status_code, 401)

    def test_dorm_selection_put_is_allowed_by_cors(self):
        response = self.client.options(
            "/me/dorm",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        self.assertEqual(response.status_code, 200)

    def test_firestore_connection_check_is_authenticated_and_read_only(self):
        self.assertEqual(self.client.post("/test-firestore").status_code, 401)
        self.db.collection.assert_not_called()
        ref = self.db.collection.return_value.document.return_value
        ref.get.return_value.exists = False
        result = self.client.post("/test-firestore", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), {"connected": True, "documentExists": False})
        ref.get.assert_called_once_with(timeout=10)
        ref.set.assert_not_called()
        ref.update.assert_not_called()
        ref.delete.assert_not_called()

    def test_legacy_firebase_module_uses_shared_helper_lazily(self):
        with patch.object(firebase_helpers, "get_db", return_value=self.db) as get_db:
            module = importlib.import_module("firebase_config")
            importlib.reload(module)
            get_db.assert_not_called()
            self.assertIs(module.db, self.db)
            get_db.assert_called_once_with()
        # Restore exported aliases after patching, for other tests/importers.
        importlib.reload(module)

    def test_compatibility_auth_uses_firebase_dependency_without_second_token_policy(self):
        module = importlib.import_module("auth")
        self.assertIs(module.get_current_user_id, firebase_helpers.current_uid)
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="firebase-test-token")
        self.assertEqual(module.get_current_user_id(credentials), "user_student")
        firebase_helpers.auth.verify_id_token.assert_called_with("firebase-test-token", check_revoked=True)
        from firebase_admin import auth
        firebase_helpers.auth.verify_id_token.side_effect = auth.InvalidIdTokenError("Invalid token")
        with self.assertRaises(HTTPException) as caught:
            module.get_current_user_id(credentials)
        self.assertEqual(caught.exception.status_code, 401)

    def test_compatibility_xp_helper_requires_gps_and_delegates_to_canonical_transaction(self):
        module = importlib.import_module("xp_service")
        with patch.object(module, "get_db") as get_db, patch.object(module, "complete_quest") as complete:
            with self.assertRaises(TypeError):
                module.complete_assigned_quest("user_student", "quest-id")
            get_db.assert_not_called()
            result = {"status": "completed", "xpAwarded": 40}
            complete.return_value = result
            self.assertIs(module.complete_assigned_quest("user_student", "quest-id", 29.65, -82.34, 8,
                                                       db=self.db, max_accuracy=35), result)
            complete.assert_called_once_with(self.db, "user_student", "quest-id", 29.65, -82.34, 8, 35)
            get_db.assert_not_called()

    def test_single_cors_layer_allows_local_hostnames_and_preserves_diagnostics(self):
        layers = [item for item in app.user_middleware if item.cls is CORSMiddleware]
        self.assertEqual(len(layers), 1)
        for origin in ["http://localhost:5173", "http://127.0.0.1:5173",
                       "http://localhost:5174", "http://127.0.0.1:5174",
                       "http://localhost:5175", "http://127.0.0.1:5175"]:
            response = self.client.options("/quests/example/complete", headers={
                "Origin": origin, "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
        response = self.client.get("/health", headers={"Origin": "http://127.0.0.1:5173"})
        self.assertIn("Server-Timing", response.headers.get("access-control-expose-headers", ""))

    def test_custom_origin_configuration_is_shared_by_cors_and_clerk_bridge(self):
        from backend.api.auth_routes import frontend_origins
        from fastapi import FastAPI
        with patch.dict("os.environ", {"FRONTEND_ORIGINS": "https://preview.example"}):
            configured = FastAPI()
            configured.add_middleware(CORSMiddleware, allow_origins=frontend_origins(),
                                      allow_methods=["POST"], allow_headers=["Authorization", "Content-Type"])
            with TestClient(configured) as client:
                for origin, expected in [("https://preview.example", 200), ("http://localhost:5173", 400)]:
                    response = client.options("/quests/assign", headers={
                        "Origin": origin, "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "authorization,content-type",
                    })
                    self.assertEqual(response.status_code, expected)

    def test_completion_requires_gps_body_even_with_valid_authentication(self):
        response = self.client.post("/quests/example/complete", headers=self.headers)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"][0]["loc"], ["body"])


if __name__ == "__main__":
    unittest.main()
