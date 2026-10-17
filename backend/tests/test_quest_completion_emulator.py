"""Opt-in real Firestore transaction tests. Never connect to a live project."""

import os
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor

from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client

from backend.quest_completion import ASSIGNMENTS, CompletionError, complete_quest


@unittest.skipUnless(os.environ.get("FIRESTORE_EMULATOR_HOST"), "Local Firestore emulator not configured")
class CompletionEmulatorTests(unittest.TestCase):
    def setUp(self):
        host = os.environ["FIRESTORE_EMULATOR_HOST"]
        if host.split(":")[0] not in ("localhost", "127.0.0.1"):
            self.fail("Tests require a loopback Firestore emulator")
        self.db = Client(project="demo-sidequest-tests", credentials=AnonymousCredentials())
        self.addCleanup(self.db.close)
        prefix = uuid.uuid4().hex
        self.uid, self.quest_id, self.dorm_id = prefix + "-user", prefix + "-quest", prefix + "-dorm"
        self.refs = []
        self.addCleanup(self.cleanup_documents)
        self.quest = {"isActive": True, "latitude": 29.65, "longitude": -82.34,
                      "radiusMeters": 100, "xpReward": 25}
        self.seed("quests", self.quest_id, self.quest)
        self.seed("dorms", self.dorm_id, {"name": "Test dorm", "totalXp": 100})
        self.seed_user(self.uid)

    def cleanup_documents(self):
        for ref in self.refs:
            ref.delete()

    def seed(self, collection, document_id, data):
        ref = self.db.collection(collection).document(document_id)
        self.refs.append(ref)
        ref.set(data)
        return ref

    def seed_user(self, uid):
        self.seed("users", uid, {"dormId": self.dorm_id, "totalXp": 10})
        self.seed(ASSIGNMENTS, f"{uid}_{self.quest_id}", {
            "userId": uid, "questId": self.quest_id, "status": "assigned", "xpAwarded": 0,
        })

    def assignment_ref(self):
        return self.db.collection(ASSIGNMENTS).document(f"{self.uid}_{self.quest_id}")

    def finish(self, uid=None, **changes):
        arguments = dict(db=self.db, user_id=uid or self.uid, quest_id=self.quest_id,
                         latitude=29.65, longitude=-82.34, accuracy=10)
        arguments.update(changes)
        return complete_quest(**arguments)

    def assert_totals(self, user_xp=10, dorm_xp=100):
        self.assertEqual(self.db.collection("users").document(self.uid).get().to_dict()["totalXp"], user_xp)
        self.assertEqual(self.db.collection("dorms").document(self.dorm_id).get().to_dict()["totalXp"], dorm_xp)

    def assert_unchanged(self):
        assignment = self.assignment_ref().get().to_dict()
        self.assertEqual(assignment["status"], "assigned")
        self.assertEqual(assignment["xpAwarded"], 0)
        self.assertNotIn("completedAt", assignment)
        self.assert_totals()

    def test_completion_and_replay_award_once(self):
        result = self.finish()
        self.assertEqual(result["xpAwarded"], 25)
        assignment = self.assignment_ref().get().to_dict()
        self.assertEqual(assignment["status"], "completed")
        self.assertEqual(assignment["xpAwarded"], 25)
        self.assertIsNotNone(assignment["completedAt"])
        with self.assertRaises(CompletionError) as error:
            self.finish()
        self.assertEqual(error.exception.status_code, 409)
        self.assert_totals(35, 125)

    def test_simultaneous_duplicate_requests_award_once(self):
        barrier = threading.Barrier(2)

        def attempt():
            barrier.wait(timeout=10)
            try:
                return self.finish()["status"]
            except CompletionError as error:
                return error.status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda _: attempt(), range(2)))
        self.assertCountEqual(outcomes, ["completed", 409])
        self.assert_totals(35, 125)

    def test_different_users_in_same_dorm_do_not_lose_xp(self):
        other_uid = self.uid + "-other"
        self.seed_user(other_uid)
        barrier = threading.Barrier(2)

        def attempt(uid):
            barrier.wait(timeout=10)
            return self.finish(uid=uid)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, [self.uid, other_uid]))
        self.assertTrue(all(result["status"] == "completed" for result in results))
        self.assert_totals(35, 150)
        self.assertEqual(self.db.collection("users").document(other_uid).get().to_dict()["totalXp"], 35)

    def test_rejected_location_does_not_write(self):
        for changes in [{"latitude": 0}, {"accuracy": 51}, {"longitude": float("nan")}]:
            with self.assertRaises(CompletionError):
                self.finish(**changes)
            self.assert_unchanged()

    def test_rechecks_current_quest_configuration_and_reward(self):
        self.db.collection("quests").document(self.quest_id).update({"xpReward": 40, "radiusMeters": 5})
        with self.assertRaises(CompletionError):
            self.finish()
        self.assert_unchanged()
        self.db.collection("quests").document(self.quest_id).update({"radiusMeters": 100})
        self.assertEqual(self.finish()["xpAwarded"], 40)
        self.assert_totals(50, 140)

    def test_invalid_assignment_or_inactive_quest_does_not_write(self):
        for change in [{"userId": "other"}, {"questId": "other"}, {"status": "cancelled"}]:
            self.assignment_ref().update(change)
            with self.assertRaises(CompletionError):
                self.finish()
            self.assert_totals()
            self.assignment_ref().update({"userId": self.uid, "questId": self.quest_id, "status": "assigned"})
        self.db.collection("quests").document(self.quest_id).update({"isActive": False})
        with self.assertRaises(CompletionError):
            self.finish()
        self.assert_unchanged()

    def test_missing_profile_dorm_quest_or_assignment(self):
        for collection, document_id in [("users", self.uid), ("dorms", self.dorm_id),
                                        ("quests", self.quest_id),
                                        (ASSIGNMENTS, f"{self.uid}_{self.quest_id}")]:
            ref = self.db.collection(collection).document(document_id)
            before = ref.get().to_dict()
            ref.delete()
            with self.assertRaises(CompletionError):
                self.finish()
            ref.set(before)
            self.assert_unchanged()

    def test_invalid_xp_configuration_cannot_partially_complete(self):
        for reward in [-1, True, 1.5, "25", None, 2**63 - 1]:
            self.db.collection("quests").document(self.quest_id).update({"xpReward": reward})
            with self.assertRaises(CompletionError):
                self.finish()
            self.assert_unchanged()
        self.db.collection("quests").document(self.quest_id).update({"xpReward": 25})
        self.db.collection("dorms").document(self.dorm_id).update({"totalXp": "invalid"})
        with self.assertRaises(CompletionError):
            self.finish()
        self.assertEqual(self.assignment_ref().get().to_dict()["status"], "assigned")
        self.assertEqual(self.db.collection("users").document(self.uid).get().to_dict()["totalXp"], 10)

    def test_zero_xp_reward_still_marks_completion(self):
        self.db.collection("quests").document(self.quest_id).update({"xpReward": 0})
        self.assertEqual(self.finish()["status"], "completed")
        self.assert_totals()


if __name__ == "__main__":
    unittest.main()
