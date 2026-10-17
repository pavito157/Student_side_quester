"""Opt-in real persistence/concurrency tests; loopback demo emulator only."""

import os
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from google.api_core.exceptions import ServiceUnavailable
from firebase_admin import firestore

from backend import quest_generation as generation, quest_persistence as persistence
from backend import firebase_helpers
from backend.quest_completion import CompletionError, complete_quest
from backend.quest_contracts import GenerateQuestRequest, GeneratedQuestProposal, ResolvedDestination
from main import app


@unittest.skipUnless(os.environ.get("FIRESTORE_EMULATOR_HOST"), "Local Firestore emulator not configured")
class PersistenceEmulatorTests(unittest.TestCase):
    def setUp(self):
        if os.environ["FIRESTORE_EMULATOR_HOST"].split(":")[0] not in ("localhost", "127.0.0.1"):
            self.fail("Tests require a loopback Firestore emulator")
        self.db = Client(project="demo-sidequest-tests", credentials=AnonymousCredentials())
        self.addCleanup(self.db.close)
        self.uid = uuid.uuid4().hex + "-user"
        self.dorm_id = self.uid + "-dorm"
        self.uids = [self.uid]
        self.db.collection("Users").document(self.uid).set({
            "displayName": "Original", "preferences": "Quiet", "goals": ["Relax"],
            "dormId": self.dorm_id, "xp": 10,
        })
        self.db.collection("dorms").document(self.dorm_id).set({"xp": 100})
        self.addCleanup(self.cleanup_documents)
        self.environment = patch.dict(os.environ, {"QUEST_XP_REWARD": "25", "QUEST_RADIUS_METERS": "100"})
        self.environment.start()
        self.addCleanup(patch.stopall)
        self.preferences = GenerateQuestRequest.model_validate({
            "location": "Anywhere", "time": {"selection": "60"}, "budget": {"selection": "0"},
        }).normalize()
        self.proposal = GeneratedQuestProposal(
            title="Test task", description="Draw three leaf shapes.", steps=["Draw three leaves."],
            locationName="AI proposed name", locationAddress="AI proposed address",
            estimatedMinutes=30, estimatedCostDollars=0,
        )
        self.resolver = MagicMock(return_value=ResolvedDestination(
            locationName="Canonical UF place", latitude=29.65, longitude=-82.34,
            placeId="verified-place", scope="uf_campus",
        ))
        self.provider = patch.object(generation, "call_gemini", return_value=self.proposal).start()

    def cleanup_documents(self):
        # Delete only records belonging to this test's unique users, never flush.
        from google.cloud.firestore_v1.base_query import FieldFilter
        for uid in self.uids:
            for collection, field in [("quests", "ownerId"), ("userQuests", "userId")]:
                for snapshot in self.db.collection(collection).where(filter=FieldFilter(field, "==", uid)).stream():
                    snapshot.reference.delete()
            self.db.collection("Users").document(uid).delete()
        self.db.collection("dorms").document(self.dorm_id).delete()

    def create(self, resolver=True, uid=None):
        return persistence.assign_generated_quest(self.db, uid or self.uid, self.preferences,
                                                   self.resolver if resolver else None)

    def records(self, collection):
        from google.cloud.firestore_v1.base_query import FieldFilter
        field = "ownerId" if collection == "quests" else "userId"
        return list(self.db.collection(collection).where(filter=FieldFilter(field, "==", self.uid)).stream())

    def assert_xp(self, user=10, dorm=100):
        self.assertEqual(self.db.collection("Users").document(self.uid).get().to_dict()["xp"], user)
        self.assertEqual(self.db.collection("dorms").document(self.dorm_id).get().to_dict()["xp"], dorm)

    def test_saved_documents_match_response_and_preserve_profile(self):
        result = self.create()
        self.assertFalse(result.reusedExisting)
        quest = self.db.collection("quests").document(result.quest.id).get().to_dict()
        assignment = self.db.collection("userQuests").document(result.assignment.id).get().to_dict()
        self.assertEqual(quest["ownerId"], self.uid)
        self.assertEqual(quest["locationName"], "Canonical UF place")
        self.assertEqual(quest["placeId"], "verified-place")
        self.assertEqual(quest["radiusMeters"], 100)
        self.assertEqual(quest["xpReward"], 25)
        self.assertIsNotNone(quest["createdAt"])
        self.assertNotIn("normalizedPreferences", quest)
        self.assertNotIn("locationAddress", quest)  # Do not present proposed address as verified.
        self.assertEqual(assignment["assignedAt"], result.assignment.assignedAt)
        self.assertEqual(assignment["status"], "assigned")
        self.assertEqual(assignment["xpAwarded"], 0)
        self.assertIsNone(assignment["completedAt"])
        profile = self.db.collection("Users").document(self.uid).get().to_dict()
        self.assertEqual(profile["activeQuestId"], result.quest.id)
        self.assertEqual(profile["preferences"], "Quiet")
        self.assertEqual(profile["goals"], ["Relax"])
        self.assertEqual(profile["displayName"], "Original")
        self.assert_xp()

    def test_repeat_and_retrieval_reuse_without_generation_or_resolver(self):
        first = self.create()
        self.provider.reset_mock()
        self.resolver.reset_mock()
        second = self.create(resolver=False)
        loaded = persistence.get_current_assignment(self.db, self.uid)
        self.assertTrue(second.reusedExisting)
        self.assertEqual(second, loaded)
        self.assertEqual(second.quest.id, first.quest.id)
        self.provider.assert_not_called()
        self.resolver.assert_not_called()
        self.assertEqual(len(self.records("quests")), 1)
        self.assertEqual(len(self.records("userQuests")), 1)

    def test_concurrent_requests_commit_one_assignment_and_no_orphan_quest(self):
        barrier = threading.Barrier(2)

        def generate(*args):
            barrier.wait(timeout=15)
            return self.proposal

        self.provider.side_effect = generate
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.create(), range(2)))
        self.assertCountEqual([result.reusedExisting for result in results], [False, True])
        self.assertEqual(results[0].quest.id, results[1].quest.id)
        self.assertEqual(len(self.records("quests")), 1)
        self.assertEqual(len(self.records("userQuests")), 1)
        self.assertEqual(persistence.get_current_assignment(self.db, self.uid).quest.id, results[0].quest.id)
        self.assert_xp()

    def test_failure_after_enqueuing_writes_rolls_back_everything(self):
        preview = generation.generate_preview(self.preferences, self.resolver)
        original = self.db.transaction

        def broken_transaction(*args, **kwargs):
            transaction = original(*args, **kwargs)
            create = transaction.create

            def fail(ref, data):
                create(ref, data)
                if ref.parent.id == "userQuests":
                    raise ServiceUnavailable("test rollback after queued writes")

            transaction.create = fail
            return transaction

        with patch.object(self.db, "transaction", side_effect=broken_transaction):
            with self.assertRaises(HTTPException) as caught:
                persistence.save_verified_assignment(self.db, self.uid, preview, persistence.AssignmentPolicy())
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(self.records("quests"), [])
        self.assertEqual(self.records("userQuests"), [])
        self.assertNotIn("activeQuestId", self.db.collection("Users").document(self.uid).get().to_dict())
        self.assert_xp()

    def test_pending_or_failed_resolver_cannot_save(self):
        with self.assertRaises(HTTPException) as caught:
            self.create(resolver=False)
        self.assertEqual(caught.exception.status_code, 503)
        self.provider.assert_not_called()
        self.resolver.side_effect = generation.DestinationResolutionError()
        with self.assertRaises(HTTPException) as caught:
            self.create()
        self.assertEqual(caught.exception.status_code, 502)
        self.assertEqual(self.records("quests"), [])
        self.assertEqual(self.records("userQuests"), [])
        self.assert_xp()

    def test_unverified_preview_is_rejected_by_persistence_boundary(self):
        preview = generation.generate_preview(self.preferences)
        with self.assertRaises(HTTPException) as caught:
            persistence.save_verified_assignment(self.db, self.uid, preview, persistence.AssignmentPolicy())
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(self.records("quests"), [])

    def test_completed_assignment_allows_next_quest_without_reawarding_old_xp(self):
        first = self.create()
        complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))
        second = self.create()
        self.assertNotEqual(first.quest.id, second.quest.id)
        self.assertFalse(second.reusedExisting)
        self.assertEqual(len(self.records("quests")), 2)
        self.assert_xp(35, 125)
        with self.assertRaises(CompletionError):
            complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
        self.assert_xp(35, 125)

    def test_configuration_changes_affect_new_quests_only(self):
        with patch.dict(os.environ, {"QUEST_XP_REWARD": "40", "QUEST_RADIUS_METERS": "80"}):
            first = self.create()
        self.assertEqual(first.quest.xpReward, 40)
        self.assertEqual(first.quest.radiusMeters, 80)
        with patch.dict(os.environ, {"QUEST_XP_REWARD": "60", "QUEST_RADIUS_METERS": "150"}):
            reused = self.create()
        self.assertEqual(reused.quest, first.quest)

    def test_legacy_assignment_without_pointer_is_reused(self):
        first = self.create()
        self.db.collection("Users").document(self.uid).update({"activeQuestId": firestore.DELETE_FIELD})
        self.provider.reset_mock()
        self.assertEqual(self.create().quest.id, first.quest.id)
        self.provider.assert_not_called()

    def test_legacy_duplicate_active_records_fail_closed(self):
        first = self.create()
        self.db.collection("Users").document(self.uid).update({"activeQuestId": firestore.DELETE_FIELD})
        duplicate = first.assignment.model_dump(exclude={"id"})
        duplicate["questId"] = "duplicate"
        self.db.collection("userQuests").document(f"{self.uid}_duplicate").set(duplicate)
        with self.assertRaises(HTTPException) as caught:
            self.create()
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(self.records("quests")), 1)

    def test_corrupt_owner_or_missing_destination_never_creates_new_quest(self):
        first = self.create()
        ref = self.db.collection("quests").document(first.quest.id)
        saved = ref.get().to_dict()
        for change in [{"ownerId": "another-user"}, {"isActive": False}]:
            ref.update(change)
            with self.assertRaises(HTTPException) as caught:
                self.create()
            self.assertEqual(caught.exception.status_code, 409)
            ref.set(saved)
        ref.delete()
        with self.assertRaises(HTTPException) as caught:
            self.create()
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(self.records("userQuests")), 1)

    def test_missing_profile_fails_before_generation(self):
        self.db.collection("Users").document(self.uid).delete()
        with self.assertRaises(HTTPException) as caught:
            self.create()
        self.assertEqual(caught.exception.status_code, 409)
        self.provider.assert_not_called()

    def test_other_user_has_no_current_assignment(self):
        first = self.create()
        other = self.uid + "-other"
        self.uids.append(other)
        self.db.collection("Users").document(other).set({"xp": 0})
        self.assertIsNone(persistence.get_current_assignment(self.db, other))
        # Even a corrupt other user's pointer cannot expose the private quest:
        self.db.collection("Users").document(other).update({"activeQuestId": first.quest.id})
        self.assertIsNone(persistence.get_current_assignment(self.db, other))

    def test_full_api_save_reload_complete_and_assign_next_with_real_transactions(self):
        app.dependency_overrides[firebase_helpers.get_db] = lambda: self.db
        app.dependency_overrides[generation.get_destination_resolver] = lambda: self.resolver
        self.addCleanup(app.dependency_overrides.clear)
        with TestClient(app) as client, \
                patch.object(firebase_helpers, "get_firebase_app"), \
                patch.object(firebase_helpers.auth, "verify_id_token", return_value={
                    "uid": self.uid, "email": "student@ufl.edu", "email_verified": True,
                }), patch("backend.quest_assignment_routes.get_db", return_value=self.db):
            headers = {"Authorization": "Bearer firebase-test-token"}
            body = {"location": "Anywhere", "time": {"selection": "60"}, "budget": {"selection": "0"}}
            first = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(first.status_code, 201, first.text)
            saved = first.json()
            self.assertEqual(saved["assignment"]["userId"], self.uid)
            self.assertEqual(saved["quest"]["placeId"], "verified-place")
            second = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(second.status_code, 200)
            self.assertTrue(second.json()["reusedExisting"])
            self.assertEqual(client.get("/me/quest", headers=headers).json(), second.json())
            self.assertEqual(self.provider.call_count, 1)
            url = f"/quests/{saved['quest']['id']}/complete"
            rejected = client.post(url, json={"latitude": 0, "longitude": 0, "accuracy": 10}, headers=headers)
            self.assertEqual(rejected.status_code, 400)
            self.assert_xp()
            location = {"latitude": 29.65, "longitude": -82.34, "accuracy": 10}
            self.assertEqual(client.post(url, json=location, headers=headers).status_code, 200)
            self.assertEqual(client.post(url, json=location, headers=headers).status_code, 409)
            self.assert_xp(35, 125)
            self.assertIsNone(client.get("/me/quest", headers=headers).json())
            following = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(following.status_code, 201)
            self.assertNotEqual(following.json()["quest"]["id"], saved["quest"]["id"])
            self.assert_xp(35, 125)


if __name__ == "__main__":
    unittest.main()
