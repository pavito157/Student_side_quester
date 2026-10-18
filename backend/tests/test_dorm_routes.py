import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.api import dorm_routes
from backend.users.dorm_catalog import DORM_OPTIONS
from backend.auth.firebase_helpers import current_uid, get_db


class DormRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(dorm_routes.router)
        self.db = Mock()
        self.app.dependency_overrides[current_uid] = lambda: "signed-in-user"
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def test_get_returns_current_residence_and_catalog(self):
        profile = self.db.collection.return_value.document.return_value.get.return_value
        profile.exists = True
        profile.to_dict.return_value = {"dormId": "beaty_towers"}

        response = self.client.get("/me/dorm")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["dormId"], "beaty_towers")
        self.assertEqual(response.json()["dormName"], "Beaty Towers")
        self.assertEqual(response.json()["dorms"], list(DORM_OPTIONS))
        self.assertIn(
            {"dormId": "off_campus", "dormName": "Off campus"},
            response.json()["dorms"],
        )

    def test_get_returns_null_selection_for_new_profile(self):
        profile = self.db.collection.return_value.document.return_value.get.return_value
        profile.exists = True
        profile.to_dict.return_value = {"xp": 0}

        response = self.client.get("/me/dorm")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["dormId"])
        self.assertIsNone(response.json()["dormName"])

    def test_get_rejects_a_missing_user_profile(self):
        profile = self.db.collection.return_value.document.return_value.get.return_value
        profile.exists = False

        response = self.client.get("/me/dorm")

        self.assertEqual(response.status_code, 404)

    def test_put_saves_a_catalog_selection_for_authenticated_user(self):
        with patch.object(
            dorm_routes,
            "save_dorm_selection",
            return_value={"dormId": "off_campus", "dormName": "Off campus"},
        ) as save:
            response = self.client.put("/me/dorm", json={"dormId": "off_campus"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["dormName"], "Off campus")
        save.assert_called_once_with(self.db, "signed-in-user", "off_campus")

    def test_put_rejects_extra_fields_and_invalid_catalog_ids(self):
        extra_field = self.client.put(
            "/me/dorm",
            json={"dormId": "beaty_towers", "userId": "another-user"},
        )
        self.assertEqual(extra_field.status_code, 422)

        invalid_id = self.client.put("/me/dorm", json={"dormId": "invented_hall"})
        self.assertEqual(invalid_id.status_code, 422)

    def test_save_creates_the_dorm_xp_document_and_updates_only_callers_profile(self):
        user_ref = Mock()
        user_ref.get.return_value.exists = True
        dorm_ref = Mock()
        dorm_ref.get.return_value.exists = False
        user_collection = Mock()
        user_collection.document.return_value = user_ref
        dorm_collection = Mock()
        dorm_collection.document.return_value = dorm_ref
        self.db.collection.side_effect = lambda name: {
            "Users": user_collection,
            "dorms": dorm_collection,
        }[name]
        transaction = Mock()
        self.db.transaction.return_value = transaction

        with patch.object(dorm_routes.firestore, "transactional", side_effect=lambda fn: fn):
            result = dorm_routes.save_dorm_selection(self.db, "signed-in-user", "off_campus")

        self.assertEqual(result, {"dormId": "off_campus", "dormName": "Off campus"})
        user_ref.get.assert_called_once_with(transaction=transaction)
        dorm_ref.get.assert_called_once_with(transaction=transaction)
        transaction.set.assert_any_call(dorm_ref, {"name": "Off campus", "xp": 0})
        transaction.set.assert_any_call(user_ref, {"dormId": "off_campus"}, merge=True)

    def test_get_rejects_an_unknown_saved_dorm(self):
        profile = self.db.collection.return_value.document.return_value.get.return_value
        profile.exists = True
        profile.to_dict.return_value = {"dormId": "unknown_hall"}

        response = self.client.get("/me/dorm")

        self.assertEqual(response.status_code, 409)


if __name__ == "__main__":
    unittest.main()
