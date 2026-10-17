"""Verify the backend merge shares Firebase and does not shadow real endpoints."""

import importlib
import re
import unittest
from collections import Counter
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend import firebase_helpers
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


if __name__ == "__main__":
    unittest.main()
