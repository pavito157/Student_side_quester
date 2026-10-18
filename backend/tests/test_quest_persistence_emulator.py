"""Opt-in real persistence/concurrency tests; loopback demo emulator only."""

import os
import io
import json
import tempfile
from contextlib import contextmanager, ExitStack
from pathlib import Path
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

from backend.quests import quest_generation as generation
from backend.quests import quest_persistence as persistence
from backend.auth import firebase_helpers
from backend.quests.quest_completion import CompletionError, complete_quest
from backend.quests.quest_contracts import GenerateQuestRequest, GeneratedQuestProposal, ResolvedDestination
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
        self.environment = patch.dict(os.environ, {"QUEST_RADIUS_METERS": "100"})
        self.environment.start()
        self.addCleanup(patch.stopall)
        self.preferences = GenerateQuestRequest.model_validate({
            "location": "Anywhere", "time": {"selection": "60"}, "budget": {"selection": "0"},
        })
        self.user_request = self.preferences
        self.preferences = self.user_request.normalize()
        self.proposal = GeneratedQuestProposal(
            title="Test task", description="Draw three leaf shapes.", steps=["Draw three leaves."],
            locationName="AI proposed name", locationAddress="AI proposed address",
            estimatedMinutes=30, estimatedCostDollars=0,
        )
        self.resolver = MagicMock(return_value=ResolvedDestination(
            locationName="Canonical UF place", latitude=29.65, longitude=-82.34,
            placeId="verified-place", scope="gainesville_city",
        ))
        self.provider = patch.object(generation, "call_gemini", return_value=self.proposal).start()

    def cleanup_documents(self):
        # Delete only records belonging to this test's unique users, never flush.
        from google.cloud.firestore_v1.base_query import FieldFilter
        for uid in self.uids:
            for collection, field in [("quests", "ownerId"), ("userQuests", "userId")]:
                for snapshot in self.db.collection(collection).where(filter=FieldFilter(field, "==", uid)).stream():
                    snapshot.reference.delete()
            for snapshot in persistence.sidequests(self.db, uid).stream():
                snapshot.reference.delete()
            self.db.collection("Users").document(uid).delete()
        self.db.collection("dorms").document(self.dorm_id).delete()

    def create(self, resolver=True, uid=None):
        return persistence.assign_generated_quest(self.db, uid or self.uid, self.preferences,
                                                   self.resolver if resolver else None,
                                                   user_request=self.user_request)

    def records(self):
        return list(persistence.sidequests(self.db, self.uid).stream())

    def assert_xp(self, user=10, dorm=100):
        self.assertEqual(self.db.collection("Users").document(self.uid).get().to_dict()["xp"], user)
        self.assertEqual(self.db.collection("dorms").document(self.dorm_id).get().to_dict()["xp"], dorm)

    def test_generate_another_from_an_event_adds_a_personal_quest_without_changing_event(self):
        original = self.create()
        ref = self.db.collection('Users').document(self.uid).collection('sidequests').document(original.quest.id)
        ref.update({'sourceGlobalEventId':'event-example'})
        self.provider.return_value = self.proposal.model_copy(update={
            'description':'Observe five plants and compare their different leaf shapes.',
            'steps':['Find five plants and describe one difference between their leaves.']})
        from backend.quests.quest_persistence import add_generated_quest
        added = add_generated_quest(self.db,self.uid,original.quest.id,self.preferences,self.resolver,user_request=self.user_request)
        self.assertNotEqual(added.quest.id,original.quest.id)
        self.assertIsNone(added.quest.sourceGlobalEventId)
        self.assertEqual(ref.get().to_dict()['sourceGlobalEventId'],'event-example')
        self.assertEqual(ref.get().to_dict()['steps'],original.quest.steps)
        self.assert_xp()

    def test_saved_documents_match_response_and_preserve_profile(self):
        result = self.create()
        self.assertFalse(result.reusedExisting)
        quest = persistence.sidequests(self.db, self.uid).document(result.quest.id).get().to_dict()
        assignment = quest
        self.assertFalse(self.db.collection("quests").document(result.quest.id).get().exists)
        self.assertFalse(self.db.collection("userQuests").document(result.assignment.id).get().exists)
        self.assertEqual(quest["ownerId"], self.uid)
        self.assertEqual(quest["locationName"], "Canonical UF place")
        self.assertEqual(quest["placeId"], "verified-place")
        self.assertEqual(quest["radiusMeters"], 100)
        self.assertEqual(quest["xpReward"], 10)
        self.assertEqual(quest["title"], self.proposal.title)
        self.assertEqual(quest["description"], self.proposal.description)
        self.assertEqual(quest["steps"], self.proposal.steps)
        self.assertEqual(quest["estimatedMinutes"], self.proposal.estimatedMinutes)
        self.assertEqual(quest["estimatedCostDollars"], self.proposal.estimatedCostDollars)
        self.assertNotIn("activeVibe", quest["userRequest"])
        self.assertEqual(quest["userRequest"], self.user_request.model_dump(mode="json", exclude={"activeVibe"}))
        self.assertEqual(GenerateQuestRequest.model_validate(quest["userRequest"]).normalize(), self.user_request.normalize())
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

    def test_three_independent_quests_persist_and_fourth_is_rejected_before_generation(self):
        saved = [self.create() for _ in range(3)]
        self.assertEqual(len({item.quest.id for item in saved}), 3)
        loaded = persistence.get_active_assignments(self.db, self.uid)
        self.assertCountEqual([item.quest.id for item in loaded], [item.quest.id for item in saved])
        self.assertEqual(persistence.get_current_assignment(self.db, self.uid).quest.id, saved[-1].quest.id)
        self.assertEqual(self.provider.call_count, 3)
        self.provider.reset_mock()
        for call in [lambda: self.create(resolver=False), lambda: self.replacement(saved[0].quest.id)]:
            with self.assertRaises(HTTPException) as caught:
                call()
            self.assertEqual(caught.exception.status_code, 429)
        self.provider.assert_not_called()
        self.assertEqual(len(self.records()), 3)
        self.assertTrue(all(item.to_dict()["status"] == "assigned" for item in self.records()))
        self.assert_xp()

    def test_concurrent_requests_can_fill_two_free_slots_without_replacing_original(self):
        first = self.create()
        barrier = threading.Barrier(2)
        def generate(*args, **kwargs):
            barrier.wait(timeout=15)
            return self.proposal
        self.provider.side_effect = generate
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.create(), range(2)))
        self.assertFalse(any(result.reusedExisting for result in results))
        self.assertEqual(len({first.quest.id, *(result.quest.id for result in results)}), 3)
        self.assertEqual(len(persistence.get_active_assignments(self.db, self.uid)), 3)
        self.assertEqual(len(self.records()), 3)
        self.assert_xp()

    def test_failure_after_enqueuing_writes_rolls_back_everything(self):
        preview = generation.generate_preview(self.preferences, self.resolver)
        original = self.db.transaction

        def broken_transaction(*args, **kwargs):
            transaction = original(*args, **kwargs)
            create = transaction.create

            def fail(ref, data):
                create(ref, data)
                if ref.parent.id == "sidequests":
                    raise ServiceUnavailable("test rollback after queued writes")

            transaction.create = fail
            return transaction

        with patch.object(self.db, "transaction", side_effect=broken_transaction):
            with self.assertRaises(HTTPException) as caught:
                persistence.save_verified_assignment(self.db, self.uid, preview, persistence.AssignmentPolicy())
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(self.records(), [])
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
        self.assertEqual(self.records(), [])
        self.assert_xp()

    def test_unverified_preview_is_rejected_by_persistence_boundary(self):
        preview = generation.generate_preview(self.preferences)
        with self.assertRaises(HTTPException) as caught:
            persistence.save_verified_assignment(self.db, self.uid, preview, persistence.AssignmentPolicy())
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(self.records(), [])

    def test_completed_assignment_allows_next_quest_without_reawarding_old_xp(self):
        first = self.create()
        complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))
        self.assertFalse(persistence.sidequests(self.db, self.uid).document(first.quest.id).get().exists)
        second = self.create()
        self.assertNotEqual(first.quest.id, second.quest.id)
        self.assertFalse(second.reusedExisting)
        self.assertEqual(len(self.records()), 1)
        self.assert_xp(20, 110)
        with self.assertRaises(CompletionError):
            complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
        self.assert_xp(20, 110)

    def test_radius_configuration_changes_affect_new_quests_only(self):
        with patch.dict(os.environ, {"QUEST_RADIUS_METERS": "80"}):
            first = self.create()
        self.assertEqual(first.quest.xpReward, 10)
        self.assertEqual(first.quest.radiusMeters, 80)
        with patch.dict(os.environ, {"QUEST_RADIUS_METERS": "150"}):
            reused = self.create()
        self.assertNotEqual(reused.quest.id, first.quest.id)
        self.assertEqual(reused.quest.radiusMeters, 150)
        self.assertEqual(persistence.sidequests(self.db, self.uid).document(first.quest.id).get().to_dict()["radiusMeters"], 80)

    def test_legacy_assignment_without_pointer_is_reused(self):
        first = self.create()
        self.db.collection("Users").document(self.uid).update({"activeQuestId": firestore.DELETE_FIELD})
        self.provider.reset_mock()
        self.assertEqual(persistence.get_current_assignment(self.db, self.uid).quest.id, first.quest.id)
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
        self.assertEqual(len(self.records()), 1)

    def test_corrupt_owner_or_missing_destination_never_creates_new_quest(self):
        first = self.create()
        ref = persistence.sidequests(self.db, self.uid).document(first.quest.id)
        saved = ref.get().to_dict()
        for change in [{"ownerId": "another-user"}, {"isActive": False}]:
            ref.update(change)
            with self.assertRaises(HTTPException) as caught:
                self.create()
            self.assertEqual(caught.exception.status_code, 409)
            ref.set(saved)
        ref.delete()
        replacement = self.create()
        self.assertNotEqual(replacement.quest.id, first.quest.id)
        self.assertEqual(len(self.records()), 1)
        self.assert_xp()

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
        self.assertNotIn("activeQuestId", self.db.collection("Users").document(other).get().to_dict())
        self.assertEqual(persistence.get_current_assignment(self.db, self.uid).quest.id, first.quest.id)

    def test_legacy_active_assignment_migrates_once_without_xp_or_generation(self):
        first = self.create()
        nested = persistence.sidequests(self.db, self.uid).document(first.quest.id)
        nested.delete()
        self.db.collection("quests").document(first.quest.id).set({
            **first.quest.model_dump(exclude={"id"}), "ownerId": self.uid,
        })
        old = self.db.collection("userQuests").document(first.assignment.id)
        old.set(first.assignment.model_dump(exclude={"id"}))
        self.provider.reset_mock()
        loaded = persistence.get_current_assignment(self.db, self.uid)
        self.assertEqual(loaded.quest, first.quest)
        self.assertTrue(nested.get().exists)
        self.assertEqual(old.get().to_dict()["status"], "migrated")
        self.assertEqual(old.get().to_dict()["migratedTo"], nested.path)
        self.assert_xp()
        self.provider.assert_not_called()
        complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))
        with self.assertRaises(CompletionError):
            complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
        self.assert_xp(20, 110)

    def test_old_completed_pointer_does_not_block_new_assignments(self):
        self.db.collection("Users").document(self.uid).update({"activeQuestId": "old-completed"})
        self.db.collection("userQuests").document(f"{self.uid}_old-completed").set({
            "userId": self.uid, "questId": "old-completed", "status": "completed", "xpAwarded": 25,
        })
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))
        self.assertFalse(self.create().reusedExisting)
        self.assert_xp()

    def test_missing_destination_pointer_is_repaired_before_new_assignment(self):
        self.db.collection("Users").document(self.uid).update({"activeQuestId": "missing-quest"})

        result = self.create()

        self.assertFalse(result.reusedExisting)
        profile = self.db.collection("Users").document(self.uid).get().to_dict()
        self.assertEqual(profile["activeQuestId"], result.quest.id)
        self.assertEqual(len(self.records()), 1)

    def test_nested_completion_race_awards_once_and_deletes_assignment(self):
        first = self.create()
        def complete_once(_):
            try:
                return complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)["status"]
            except CompletionError as error:
                return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(complete_once, range(2)))
        self.assertCountEqual(results, ["completed", 404])
        self.assertFalse(persistence.sidequests(self.db, self.uid).document(first.quest.id).get().exists)
        self.assertNotIn("activeQuestId", self.db.collection("Users").document(self.uid).get().to_dict())
        self.assert_xp(20, 110)

    def test_abandon_deletes_nested_sidequest_without_awarding_xp(self):
        first = self.create()
        result = persistence.abandon_quest(self.db, self.uid, first.quest.id)

        self.assertEqual(result, {"questId": first.quest.id, "status": "abandoned"})
        self.assertFalse(persistence.sidequests(self.db, self.uid).document(first.quest.id).get().exists)
        self.assertNotIn("activeQuestId", self.db.collection("Users").document(self.uid).get().to_dict())
        self.assert_xp()
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))

    def test_nested_completion_rejects_corruption_without_mutating_state_or_xp(self):
        first = self.create()
        ref = persistence.sidequests(self.db, self.uid).document(first.quest.id)
        saved = ref.get().to_dict()
        for changes, expected in [({"ownerId": None}, 403), ({"userId": "another-user"}, 403),
                                  ({"questId": "another-quest"}, 409), ({"xpReward": -1}, 409)]:
            ref.update(changes)
            with self.assertRaises(CompletionError) as caught:
                complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
            self.assertEqual(caught.exception.status_code, expected)
            self.assertEqual(ref.get().to_dict()["status"], "assigned")
            self.assert_xp()
            ref.set(saved)

    def test_teammate_completion_helper_keeps_gps_dorm_awards_and_replay_protection(self):
        from xp_service import complete_assigned_quest
        first = self.create()
        def finish(latitude=29.65, longitude=-82.34, accuracy=10):
            return complete_assigned_quest(self.uid, first.quest.id, latitude, longitude, accuracy, db=self.db)
        for location in [(0, 0, 10), (29.65, -82.34, 100)]:
            with self.assertRaises(CompletionError) as caught:
                finish(*location)
            self.assertEqual(caught.exception.status_code, 400)
            self.assert_xp()
        user = self.db.collection("Users").document(self.uid)
        user.update({"dormId": None})
        with self.assertRaises(CompletionError) as caught:
            finish()
        self.assertEqual(caught.exception.status_code, 409)
        self.assert_xp()
        user.update({"dormId": self.dorm_id})
        def complete_once(_):
            try:
                return finish()
            except CompletionError as error:
                return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(complete_once, range(2)))
        success = [result for result in results if isinstance(result, dict)]
        self.assertEqual(len(success), 1)
        self.assertIn(404, results)
        self.assertEqual(success[0]["xpAwarded"], 10)
        self.assertNotIn("xp_awarded", success[0])
        self.assert_xp(20, 110)
        self.assertFalse(persistence.sidequests(self.db, self.uid).document(first.quest.id).get().exists)
        self.assertEqual(list(user.collection("assignedQuests").stream()), [])

    def test_nested_assignment_is_private_and_prepared_requests_are_not_quests(self):
        persistence.sidequests(self.db, self.uid).document("old-preview").set({
            "status": "prepared", "isActive": True, "xpValue": 500,
        })
        first = self.create()
        with self.wired_resolver_client() as (client, _lookup, _place):
            headers = {"Authorization": "Bearer test-token"}
            self.assertEqual([q["id"] for q in client.get("/quests", headers=headers).json()["quests"]], [first.quest.id])
            self.assertEqual(client.get(f"/quests/{first.quest.id}", headers=headers).status_code, 200)
            self.assertEqual(len(client.get("/me/quests?status=assigned", headers=headers).json()["quests"]), 1)
        with self.assertRaises(CompletionError):
            complete_quest(self.db, self.uid, "old-preview", 29.65, -82.34, 10)
        with self.assertRaises(CompletionError):
            complete_quest(self.db, "someone-else", first.quest.id, 29.65, -82.34, 10)
        self.assert_xp()

    def replacement(self, quest_id):
        return persistence.replace_generated_quest(self.db, self.uid, quest_id, self.preferences, self.resolver)

    def use_new_activity(self):
        self.provider.return_value = self.proposal.model_copy(update={
            "title": "Different challenge", "description": "Invent a short movement sequence.",
            "steps": ["Perform three gentle movements in order."],
        })

    def test_additional_quest_keeps_original_independently_completable(self):
        first = self.create()
        self.use_new_activity()
        second = self.replacement(first.quest.id)
        self.assertNotEqual(first.quest.id, second.quest.id)
        self.assertFalse(second.reusedExisting)
        old = persistence.sidequests(self.db, self.uid).document(first.quest.id).get().to_dict()
        self.assertEqual(old["status"], "assigned")
        self.assertTrue(old["isActive"])
        self.assertNotIn("skippedAt", old)
        self.assert_xp()
        complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
        self.assertEqual([item.quest.id for item in persistence.get_active_assignments(self.db, self.uid)], [second.quest.id])
        self.assert_xp(20, 110)
        complete_quest(self.db, self.uid, second.quest.id, 29.65, -82.34, 10)
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))
        self.assert_xp(30, 120)

    def test_abandon_selected_quest_frees_one_slot_without_affecting_others(self):
        saved = [self.create() for _ in range(3)]
        persistence.abandon_quest(self.db, self.uid, saved[1].quest.id)
        self.assertCountEqual([item.quest.id for item in persistence.get_active_assignments(self.db, self.uid)],
                              [saved[0].quest.id, saved[2].quest.id])
        fresh = self.create()
        self.assertEqual(len(persistence.get_active_assignments(self.db, self.uid)), 3)
        self.assertNotIn(fresh.quest.id, [item.quest.id for item in saved])
        self.assertFalse(persistence.sidequests(self.db, self.uid).document(saved[1].quest.id).get().exists)
        self.assert_xp()

    def test_active_capacity_is_rechecked_after_provider_returns(self):
        first = self.create()
        preview = generation.generate_preview(self.preferences, self.resolver)
        self.use_new_activity()
        proposal = self.provider.return_value
        def generate(*args, **kwargs):
            for _ in range(2):
                persistence.save_verified_assignment(self.db, self.uid, preview, persistence.AssignmentPolicy())
            return proposal
        self.provider.side_effect = generate
        with self.assertRaises(HTTPException) as caught:
            self.replacement(first.quest.id)
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(len(self.records()), 3)
        self.assertTrue(all(item.to_dict()["status"] == "assigned" for item in self.records()))
        self.assert_xp()

    def test_replacement_generation_and_database_failures_leave_old_quest_active(self):
        first = self.create()
        self.provider.side_effect = HTTPException(504, "Provider timeout")
        with self.assertRaises(HTTPException):
            self.replacement(first.quest.id)
        self.provider.side_effect = None
        self.use_new_activity()
        original = self.db.transaction
        def broken_transaction(*args, **kwargs):
            transaction = original(*args, **kwargs)
            create = transaction.create
            def fail(ref, data):
                create(ref, data)
                raise ServiceUnavailable("Failure after queued skip and create")
            transaction.create = fail
            return transaction
        with patch.object(self.db, "transaction", side_effect=broken_transaction):
            with self.assertRaises(HTTPException) as caught:
                self.replacement(first.quest.id)
            self.assertEqual(caught.exception.status_code, 503)
        old = persistence.sidequests(self.db, self.uid).document(first.quest.id).get().to_dict()
        self.assertEqual(old["status"], "assigned")
        self.assertEqual(old["replacementCount"], 0)
        self.assertNotIn("skippedAt", old)
        self.assertEqual(len(self.records()), 1)
        self.assertEqual(persistence.get_current_assignment(self.db, self.uid).quest.id, first.quest.id)
        self.assert_xp()

    def test_concurrent_additional_requests_cannot_overfill_last_slot(self):
        first = self.create()
        self.create()
        self.use_new_activity()
        proposal = self.provider.return_value
        barrier = threading.Barrier(2)
        def generate(*args, **kwargs):
            barrier.wait(timeout=15)
            return proposal
        self.provider.side_effect = generate
        def add_once(_):
            try:
                return self.replacement(first.quest.id)
            except HTTPException as error:
                return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(add_once, range(2)))
        self.assertEqual(sum(isinstance(result, persistence.AssignQuestResponse) for result in results), 1)
        self.assertIn(429, results)
        self.assertEqual(len(self.records()), 3)
        self.assertEqual(len(persistence.get_active_assignments(self.db, self.uid)), 3)
        self.assert_xp()

    def test_completion_during_generation_is_preserved_and_cannot_be_skipped(self):
        first = self.create()
        self.use_new_activity()
        replacement_proposal = self.provider.return_value
        def generate(*args, **kwargs):
            complete_quest(self.db, self.uid, first.quest.id, 29.65, -82.34, 10)
            return replacement_proposal
        self.provider.side_effect = generate
        with self.assertRaises(HTTPException) as caught:
            self.replacement(first.quest.id)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(self.records()), 0)
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))
        self.assert_xp(20, 110)

    def test_abandon_during_generation_does_not_resurrect_the_old_assignment(self):
        first = self.create()
        self.use_new_activity()
        replacement_proposal = self.provider.return_value
        def generate(*args, **kwargs):
            persistence.abandon_quest(self.db, self.uid, first.quest.id)
            return replacement_proposal
        self.provider.side_effect = generate
        with self.assertRaises(HTTPException) as caught:
            self.replacement(first.quest.id)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.records(), [])
        self.assertIsNone(persistence.get_current_assignment(self.db, self.uid))
        self.assert_xp()

    def test_additional_endpoint_returns_json_and_all_quests_remain_selectable(self):
        with self.wired_resolver_client() as (client, _lookup, _place):
            headers = {"Authorization": "Bearer test-token"}
            body = {"location": "Anywhere", "time": {"selection": "60"}, "budget": {"selection": "0"}}
            first = client.post("/quests/assign", json=body, headers=headers).json()
            self.use_new_activity()
            result = client.post(f"/quests/{first['quest']['id']}/another", json=body, headers=headers)
            self.assertEqual(result.status_code, 201, result.text)
            self.assertEqual(result.json()["assignment"]["xpAwarded"], 0)
            listing = client.get("/me/active-quests", headers=headers)
            self.assertEqual(listing.status_code, 200, listing.text)
            self.assertEqual(listing.headers["cache-control"], "no-store")
            self.assertCountEqual([item["quest"]["id"] for item in listing.json()],
                                  [first["quest"]["id"], result.json()["quest"]["id"]])
            for item in listing.json():
                self.assertTrue(item["quest"]["steps"])
                self.assertTrue(item["quest"]["description"])
            history = client.get("/me/quests?status=assigned", headers=headers)
            self.assertEqual(len(history.json()["quests"]), 2)
            self.assertEqual(client.get("/me/quests?status=skipped", headers=headers).json()["quests"], [])
            self.assert_xp()

    def test_old_replacement_chain_restores_two_recent_alternatives_only_once(self):
        current = self.create()
        collection = persistence.sidequests(self.db, self.uid)
        template = collection.document(current.quest.id).get().to_dict()
        next_id = current.quest.id
        for i in range(3):
            quest_id = f"old-{i}"
            collection.document(quest_id).set({**template, "questId": quest_id,
                "status": "skipped", "isActive": False, "replacementCount": 3 - i,
                "replacedByQuestId": next_id, "skippedAt": firestore.SERVER_TIMESTAMP})
            next_id = quest_id
        self.db.collection("Users").document(self.uid).update({"activeQuestSchemaVersion": firestore.DELETE_FIELD})
        loaded = persistence.get_active_assignments(self.db, self.uid)
        self.assertCountEqual([item.quest.id for item in loaded], [current.quest.id, "old-0", "old-1"])
        self.assertEqual(collection.document("old-2").get().to_dict()["status"], "skipped")
        persistence.abandon_quest(self.db, self.uid, "old-0")
        self.assertEqual(len(persistence.get_active_assignments(self.db, self.uid)), 2)
        self.assertFalse(collection.document("old-0").get().exists)
        self.assertEqual(collection.document("old-2").get().to_dict()["status"], "skipped")
        self.assert_xp()

    def test_legacy_counter_three_does_not_prevent_another_active_quest(self):
        first = self.create()
        persistence.sidequests(self.db, self.uid).document(first.quest.id).update({"replacementCount": 3})
        self.use_new_activity()
        self.replacement(first.quest.id)
        self.assertEqual(len(persistence.get_active_assignments(self.db, self.uid)), 2)
        self.assert_xp()

    def test_multi_stop_quest_occupies_one_slot_and_preserves_other_active_quests(self):
        first, second = self.create(), self.create()
        with self.wired_resolver_client() as (client, lookup, place):
            headers = {"Authorization": "Bearer test-token"}
            other_place = {**place, "id": "second-place", "displayName": {"text": "Second verified stop"},
                           "location": {"latitude": 29.655, "longitude": -82.345}}
            lookup.side_effect = lambda *args, **kwargs: io.BytesIO(json.dumps({"places": [place, other_place]}).encode())
            self.provider.return_value = self.proposal.model_copy(update={
                "steps": ["Perform a small movement sequence at the first stop.", "Find three shapes at the second stop."],
                "stepProofMethods": ["location", "location"],
                "stepDestinationIndexes": [0, 1], "routeCandidateIndexes": [0, 1],
            })
            body = {"location": "Origin", "originCoordinates": {"latitude": 29.65, "longitude": -82.34},
                    "time": {"selection": "60"}, "budget": {"selection": "0"}, "multiQuest": True}
            created = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(created.status_code, 201, created.text)
            route = created.json()["quest"]
            self.assertEqual(len(route["destinations"]), 2)
            self.assertEqual(len(client.get("/me/active-quests", headers=headers).json()), 3)
            self.provider.reset_mock()
            self.assertEqual(client.post("/quests/assign", json=body, headers=headers).status_code, 429)
            self.provider.assert_not_called()
            url = f"/quests/{route['id']}/complete"
            origin = {"latitude": 29.65, "longitude": -82.34, "accuracy": 10}
            self.assertEqual(client.post(url, json={**origin, "stopIndex": 1}, headers=headers).status_code, 409)
            self.assert_xp()
            partial = client.post(url, json={**origin, "stopIndex": 0}, headers=headers)
            self.assertEqual(partial.status_code, 200, partial.text)
            self.assertEqual(partial.json()["status"], "in_progress")
            self.assertEqual(partial.json()["xpAwarded"], 5)
            self.assert_xp(15, 105)
            self.assertEqual(client.post(url, json={**origin, "stopIndex": 0}, headers=headers).status_code, 409)
            loaded = client.get("/me/active-quests", headers=headers).json()
            self.assertEqual(len(loaded), 3)  # An unfinished route still occupies its slot.
            self.assertEqual(next(item for item in loaded if item["quest"]["id"] == route["id"])["quest"]["completedStops"], [0])
            self.assertEqual(client.post("/quests/assign", json=body, headers=headers).status_code, 429)
            self.assertEqual(client.post(url, json={**origin, "stopIndex": 1}, headers=headers).status_code, 400)
            destination = {"latitude": 29.655, "longitude": -82.345, "accuracy": 10, "stopIndex": 1}
            completed = client.post(url, json=destination, headers=headers)
            self.assertEqual(completed.status_code, 200, completed.text)
            self.assertEqual(completed.json()["status"], "completed")
            self.assertEqual(completed.json()["xpAwardedSoFar"], route["xpReward"])
            self.assert_xp(20, 110)
            self.assertEqual(client.post(url, json=destination, headers=headers).status_code, 404)
            self.assertCountEqual([item.quest.id for item in persistence.get_active_assignments(self.db, self.uid)],
                                  [first.quest.id, second.quest.id])
            persistence.abandon_quest(self.db, self.uid, first.quest.id)
            self.assert_xp(20, 110)
            self.assertEqual([item.quest.id for item in persistence.get_active_assignments(self.db, self.uid)], [second.quest.id])

    def test_guest_multi_stop_preview_has_structured_json_and_never_saves_or_awards_xp(self):
        with self.wired_resolver_client() as (client, lookup, place):
            second = {**place, "id": "second-place", "displayName": {"text": "Second verified stop"},
                      "location": {"latitude": 29.655, "longitude": -82.345}}
            lookup.side_effect = lambda *args, **kwargs: io.BytesIO(json.dumps({"places": [place, second]}).encode())
            self.provider.return_value = self.proposal.model_copy(update={
                "steps": ["Try the first task.", "Try the second task."],
                "stepProofMethods": ["location", "location"],
                "stepDestinationIndexes": [0, 1], "routeCandidateIndexes": [0, 1],
            })
            result = client.post("/quests/generate", json={
                "location": "Origin", "originCoordinates": {"latitude": 29.65, "longitude": -82.34},
                "time": {"selection": "60"}, "budget": {"selection": "0"}, "multiQuest": True,
            })
            self.assertEqual(result.status_code, 200, result.text)
            self.assertFalse(result.json()["saved"])
            self.assertTrue(result.json()["destinationVerified"])
            self.assertEqual(len(result.json()["destinations"]), 2)
            self.assertEqual(self.records(), [])
            self.assert_xp()
            self.assertEqual(client.post("/quests/assign", json=self.user_request.model_dump(mode="json")).status_code, 401)

    @contextmanager
    def wired_resolver_client(self):
        """Real routes, resolver, models and DB; only auth/provider I/O is doubled."""
        from backend.quests import destination_resolver
        with ExitStack() as stack:
            folder = stack.enter_context(tempfile.TemporaryDirectory())
            boundary = Path(folder) / "synthetic-test-only.geojson"
            boundary.write_text(json.dumps({
                "type": "Feature", "properties": {
                    "scope": "gainesville_city", "source_url": "https://example.invalid/test-only",
                    "reviewed_by": "test fixture", "reviewed_on": "2026-10-17",
                }, "geometry": {"type": "Polygon", "coordinates": [[
                    [-82.36, 29.64], [-82.33, 29.64], [-82.33, 29.67],
                    [-82.36, 29.67], [-82.36, 29.64],
                ]]},
            }))
            stack.enter_context(patch.dict(os.environ, {
                "GAINESVILLE_BOUNDARY_PATH": str(boundary), "GOOGLE_PLACES_API_KEY": "test-only",
            }))
            place = {
                "id": "provider-test-place", "displayName": {"text": self.proposal.locationName},
                "formattedAddress": self.proposal.locationAddress + ", USA",
                "location": {"latitude": 29.65, "longitude": -82.34},
            }
            lookup = stack.enter_context(patch.object(destination_resolver, "urlopen"))
            lookup.side_effect = lambda *args, **kwargs: io.BytesIO(json.dumps({"places": [place]}).encode())
            stack.enter_context(patch.object(firebase_helpers, "get_firebase_app"))
            stack.enter_context(patch.object(firebase_helpers.auth, "verify_id_token", return_value={
                "uid": self.uid, "email": "student@ufl.edu", "email_verified": True,
            }))
            stack.enter_context(patch("backend.api.quest_assignment_routes.get_db", return_value=self.db))
            app.dependency_overrides[firebase_helpers.get_db] = lambda: self.db
            self.addCleanup(app.dependency_overrides.clear)
            client = stack.enter_context(TestClient(app))
            yield client, lookup, place

    def test_default_resolver_returns_saved_structured_json_and_completes(self):
        # No resolver dependency override: exercise the teammate's actual wiring.
        with self.wired_resolver_client() as (client, lookup, _place):
            headers = {"Authorization": "Bearer firebase-test-token"}
            self.assertIsNone(client.get("/me/quest", headers=headers).json())
            body = {
                "location": "Test origin", "time": {"selection": "60", "customMinutes": None},
                "budget": {"selection": "0", "customDollars": None},
                "distance": {"maxDistance": 2, "unit": "miles"},
                "originCoordinates": {"latitude": 29.65, "longitude": -82.34},
                "goals": ["Relax"], "vibePreferences": None,
            }
            result = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(result.status_code, 201, result.text)
            self.assertEqual(result.headers["cache-control"], "no-store")
            self.assertIn("resolver;dur=", result.headers["server-timing"])
            saved = result.json()
            from backend.quests.quest_contracts import AssignQuestResponse
            AssignQuestResponse.model_validate(saved)
            self.assertEqual(saved["quest"]["placeId"], "provider-test-place")
            self.assertEqual(saved["assignment"]["userId"], self.uid)
            self.assertFalse(saved["reusedExisting"])
            self.assert_xp()
            self.saved_response = saved  # Available to a manual local test runner.
            again = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(again.status_code, 201)
            self.assertFalse(again.json()["reusedExisting"])
            self.assertEqual(client.get("/me/quest", headers=headers).json()["quest"], again.json()["quest"])
            # Each of the two assignments runs four distinct discovery profiles.
            self.assertEqual(lookup.call_count, 8)
            self.assertEqual(self.provider.call_count, 2)
            url = f"/quests/{saved['quest']['id']}/complete"
            location = {"latitude": 29.65, "longitude": -82.34, "accuracy": 10}
            self.assertEqual(client.post(url, headers=headers, json=location).status_code, 200)
            self.assertEqual(client.post(url, headers=headers, json=location).status_code, 404)
            self.assert_xp(20, 110)
            self.assertEqual(client.get("/me/quest", headers=headers).json()["quest"]["id"], again.json()["quest"]["id"])

    def test_real_resolver_failure_paths_never_save_or_award_xp(self):
        from urllib.error import URLError
        with self.wired_resolver_client() as (client, lookup, place):
            headers = {"Authorization": "Bearer firebase-test-token"}
            body = {"location": "Anywhere", "time": {"selection": "60"}, "budget": {"selection": "0"}}
            cases = [
                ("unknown", {"places": []}, 409),
                ("ambiguous", {"places": [place, {**place, "id": "another-id"}]}, 409),
                ("outside scope", {"places": [{**place, "location": {"latitude": 0, "longitude": 0}}]}, 409),
                ("malformed provider", {"places": [{}]}, 503),
            ]
            for label, response, status in cases:
                lookup.side_effect = lambda *a, _response=response, **kw: io.BytesIO(json.dumps(_response).encode())
                with self.subTest(label=label):
                    result = client.post("/quests/assign", json=body, headers=headers)
                    self.assertEqual(result.status_code, status, result.text)
                    self.assertEqual(self.records(), [])
                    self.assert_xp()
            lookup.side_effect = URLError("test provider unavailable")
            self.assertEqual(client.post("/quests/assign", json=body, headers=headers).status_code, 503)
            lookup.side_effect = lambda *a, **kw: io.BytesIO(json.dumps({"places": [place]}).encode())
            limited = {**body, "location": "Distant test origin", "distance": {"maxDistance": 0.01, "unit": "miles"},
                       "originCoordinates": {"latitude": 29.66, "longitude": -82.34}}
            self.assertEqual(client.post("/quests/assign", json=limited, headers=headers).status_code, 409)
            for missing in ["GOOGLE_PLACES_API_KEY", "GAINESVILLE_BOUNDARY_PATH"]:
                with patch.dict(os.environ, {missing: ""}):
                    self.assertEqual(client.post("/quests/assign", json=body, headers=headers).status_code, 503)
            self.assertEqual(self.records(), [])
            self.assertNotIn("activeQuestId", self.db.collection("Users").document(self.uid).get().to_dict())
            self.assert_xp()

    def test_full_api_save_reload_complete_and_assign_next_with_real_transactions(self):
        app.dependency_overrides[firebase_helpers.get_db] = lambda: self.db
        app.dependency_overrides[generation.get_destination_resolver] = lambda: self.resolver
        self.addCleanup(app.dependency_overrides.clear)
        with TestClient(app) as client, \
                patch.object(firebase_helpers, "get_firebase_app"), \
                patch.object(firebase_helpers.auth, "verify_id_token", return_value={
                    "uid": self.uid, "email": "student@ufl.edu", "email_verified": True,
                }), patch("backend.api.quest_assignment_routes.get_db", return_value=self.db):
            headers = {"Authorization": "Bearer firebase-test-token"}
            body = {"location": "Anywhere", "time": {"selection": "60"}, "budget": {"selection": "0"}}
            first = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(first.status_code, 201, first.text)
            saved = first.json()
            self.assertEqual(saved["assignment"]["userId"], self.uid)
            self.assertEqual(saved["quest"]["placeId"], "verified-place")
            second = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(second.status_code, 201)
            self.assertFalse(second.json()["reusedExisting"])
            self.assertNotEqual(second.json()["quest"]["id"], saved["quest"]["id"])
            loaded = client.get("/me/quest", headers=headers).json()
            self.assertEqual(loaded["quest"], second.json()["quest"])
            self.assertEqual(self.provider.call_count, 2)
            url = f"/quests/{saved['quest']['id']}/complete"
            rejected = client.post(url, json={"latitude": 0, "longitude": 0, "accuracy": 10}, headers=headers)
            self.assertEqual(rejected.status_code, 400)
            self.assert_xp()
            location = {"latitude": 29.65, "longitude": -82.34, "accuracy": 10}
            self.assertEqual(client.post(url, json=location, headers=headers).status_code, 200)
            self.assertEqual(client.post(url, json=location, headers=headers).status_code, 404)
            self.assert_xp(20, 110)
            self.assertEqual(client.get("/me/quest", headers=headers).json()["quest"]["id"], second.json()["quest"]["id"])
            following = client.post("/quests/assign", json=body, headers=headers)
            self.assertEqual(following.status_code, 201)
            self.assertNotEqual(following.json()["quest"]["id"], saved["quest"]["id"])
            self.assert_xp(20, 110)  # Generating the next quest awards no XP.


if __name__ == "__main__":
    unittest.main()
