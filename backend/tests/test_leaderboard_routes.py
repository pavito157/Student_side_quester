import unittest
from unittest.mock import patch
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.api_core.exceptions import GoogleAPICallError

from backend import leaderboard_routes
from backend.firebase_helpers import current_uid, get_db
from backend.dorm_catalog import DORM_CATALOG


class Snapshot:
    def __init__(self, document_id, data):
        self.id = document_id
        self.data = data

    def to_dict(self):
        return self.data


class LeaderboardRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(leaderboard_routes.router)
        self.db = Mock()
        self.collections = {"Users": Mock(), "dorms": Mock()}
        for collection in self.collections.values():
            collection.stream.return_value = []
        self.db.collection.side_effect = lambda name: self.collections[name]
        self.app.dependency_overrides[current_uid] = lambda: "signed-in-user"
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def set_documents(self, collection, documents):
        self.collections[collection].stream.return_value = [
            Snapshot(document_id, data) for document_id, data in documents
        ]

    def test_individual_board_sorts_named_users_and_supports_display_name_and_legacy_xp(self):
        self.set_documents("Users", [
            ("user-z", {"username": "Zed", "displayName": "Ignored", "xp": 25}),
            ("user-a", {"displayName": "Ada", "totalXp": 30}),
            ("user-hidden", {"xp": 10}),
        ])

        response = self.client.get("/leaderboard")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "leaderboard": [
                {"userId": "user-a", "username": "Ada", "xp": 30},
                {"userId": "user-z", "username": "Zed", "xp": 25},
            ],
        })

    def test_dorm_board_sums_member_balances_and_only_counts_catalog_dorms(self):
        self.set_documents("Users", [
            ("first", {"dormId": "broward_hall", "xp": 8}),
            ("second", {"dormId": "broward_hall", "totalXp": 5}),
            ("no-dorm", {"xp": 2}),
            ("unknown-dorm", {"dormId": "not-in-catalog", "xp": 4}),
        ])

        response = self.client.get("/leaderboard/dorms")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        by_id = {entry["dormId"]: entry for entry in data["leaderboard"]}
        self.assertEqual(by_id["broward_hall"], {
            "dormId": "broward_hall",
            "dormName": "Broward Hall",
            "xp": 13,
            "memberCount": 2,
        })
        self.assertEqual(by_id["cypress_hall"]["xp"], 0)
        self.assertEqual(by_id["off_campus"]["xp"], 0)
        self.assertNotIn("unassignedUsers", data)

    def test_dorm_board_includes_all_user_supplied_halls_and_off_campus(self):
        self.set_documents("Users", [])

        response = self.client.get("/leaderboard/dorms")

        self.assertEqual(response.status_code, 200)
        actual = [(entry["dormId"], entry["dormName"]) for entry in response.json()["leaderboard"]]
        self.assertEqual(set(actual), set(DORM_CATALOG))
        self.assertEqual(len(actual), len(DORM_CATALOG))

    def test_invalid_xp_fails_instead_of_returning_partial_board(self):
        self.set_documents("Users", [
            ("valid", {"username": "Student", "xp": 10}),
            ("invalid", {"username": "Broken", "xp": True}),
        ])

        response = self.client.get("/leaderboard")

        self.assertEqual(response.status_code, 503)
        self.assertIn("invalid XP balance", response.json()["detail"])

    def test_firestore_failure_is_reported(self):
        self.collections["Users"].stream.side_effect = GoogleAPICallError("offline")

        response = self.client.get("/leaderboard")

        self.assertEqual(response.status_code, 503)
        self.assertIn("temporarily unavailable", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
