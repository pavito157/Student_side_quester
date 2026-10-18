import os
import unittest
import uuid
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client

from backend import global_quests as g
from backend.auth.firebase_helpers import current_uid, get_db

NOW = datetime(2026, 10, 18, 18, tzinfo=timezone.utc)


def payload(org="campus-events", **changes):
    return g.CreateEvent(**{
        "organizationId": org, "title": "First GBM", "description": "Meet the organization and plan the semester.",
        "locationName": "Campus meeting room", "latitude": 29.65, "longitude": -82.34,
        "startsAt": NOW - timedelta(minutes=10), "endsAt": NOW + timedelta(hours=1), **changes,
    })


class GlobalQuestRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(g.router)
        self.db = Mock()
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.app.dependency_overrides[current_uid] = lambda: "verified-user"
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def test_defaults_are_configurable_and_fail_closed(self):
        with patch.dict(os.environ, {"GLOBAL_QUEST_DEFAULT_XP": "40", "GLOBAL_QUEST_RADIUS_METERS": "75"}):
            self.assertEqual(g.default_policy().xpReward, 40)
            self.assertEqual(g.default_policy().radiusMeters, 75)
        for key, value in [("GLOBAL_QUEST_DEFAULT_XP", "-1"), ("GLOBAL_QUEST_VERIFICATION_MODE", "bad"), ("GLOBAL_QUEST_GRACE_MINUTES", "300")]:
            with patch.dict(os.environ, {key: value}), self.assertRaises(HTTPException):
                g.default_policy()

    def test_time_and_input_validation(self):
        body = payload().model_dump(mode="json")
        for changes in [{"endsAt": body["startsAt"]}, {"startsAt": "2026-10-18T18:00:00"},
                        {"xpReward": True}, {"xpReward": 25}, {"xpReward": 500}, {"latitude": 91}, {"latitude": False},
                        {"createdBy": "spoofed-user"}, {"verificationMode": "honor"}, {"organizationId": "bad/id"}]:
            response = self.client.post("/global-quests", json={**body, **changes})
            self.assertEqual(response.status_code, 422, changes)
        self.assertEqual(self.client.post("/global-quests/event/check-in", json={"userId": "spoofed"}).status_code, 422)

    def test_create_uses_verified_identity_not_client_identity(self):
        with patch.object(g, "publish_event", side_effect=HTTPException(403, "Organization admin access required.")) as publish:
            response = self.client.post("/global-quests", json=payload().model_dump(mode="json"))
            self.assertEqual(response.status_code, 403)
            self.assertEqual(publish.call_args.args[1], "verified-user")

    def test_public_event_feed_is_unauthenticated_and_allowlisted(self):
        snapshot = Mock()
        snapshot.to_dict.return_value = {
            **payload().model_dump(),
            **g.default_policy().model_dump(),
            "id": "public-event",
            "organizationName": "Campus Events",
            "createdBy": "private-admin-id",
            "createdAt": NOW,
            "status": "published",
        }
        self.db.collection.return_value.where.return_value.order_by.return_value.stream.return_value = [snapshot]
        self.app.dependency_overrides.pop(current_uid)

        with patch.object(g, "utc_now", return_value=NOW):
            response = self.client.get("/global-quests/public")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        event = response.json()[0]
        self.assertEqual(event["latitude"], 29.65)
        self.assertEqual(event["longitude"], -82.34)
        self.assertEqual(event["locationName"], "Campus meeting room")
        self.assertNotIn("createdBy", event)
        self.assertNotIn("createdAt", event)
        self.assertNotIn("radiusMeters", event)
        self.assertNotIn("verificationMode", event)

    def test_all_routes_require_auth(self):
        self.app.dependency_overrides.pop(current_uid)
        for method, path, body in [("GET", "/global-quests", None), ("POST", "/global-quests", payload().model_dump(mode="json")),
                                  ("POST", "/global-quests/event/check-in", {})]:
            response = self.client.request(method, path, **({"json": body} if body is not None else {}))
            self.assertEqual(response.status_code, 401)


@unittest.skipUnless(os.environ.get("FIRESTORE_EMULATOR_HOST"), "Local emulator required")
class GlobalQuestEmulatorTests(unittest.TestCase):
    def setUp(self):
        self.assertIn(os.environ["FIRESTORE_EMULATOR_HOST"].split(":")[0], ("localhost", "127.0.0.1"))
        self.db = Client(project="demo-sidequest-tests", credentials=AnonymousCredentials())
        self.addCleanup(self.db.close)
        self.prefix = "global-" + uuid.uuid4().hex
        self.uid = self.prefix + "-user"
        self.org = self.prefix + "-org"
        self.dorm = "off_campus"
        self.user_ref = self.db.collection("Users").document(self.uid)
        self.org_ref = self.db.collection(g.ORGANIZATIONS).document(self.org)
        self.user_ref.set({"xp": 10, "dormId": self.dorm, "preferences": "Keep me"})
        # Shared catalog ID: capture original so this suite never resets other test data.
        self.dorm_ref = self.db.collection("dorms").document(self.dorm)
        prior = self.dorm_ref.get()
        self.dorm_ref.set({"xp": 100, "name": "Off campus"})
        self.addCleanup(lambda: self.dorm_ref.set(prior.to_dict()) if prior.exists else self.dorm_ref.delete())
        self.org_ref.set({"name": "Test Organization", "adminUserIds": [self.uid], "isActive": True})
        self.addCleanup(self.org_ref.delete)
        self.addCleanup(self.user_ref.delete)
        self.clock = patch.object(g, "utc_now", return_value=NOW)
        self.clock.start(); self.addCleanup(self.clock.stop)
        self.env = patch.dict(os.environ, {
            "GLOBAL_QUEST_DEFAULT_XP": "25", "GLOBAL_QUEST_RADIUS_METERS": "100",
            "GLOBAL_QUEST_MAX_ACCURACY_METERS": "50", "GLOBAL_QUEST_VERIFICATION_MODE": "gps", "GLOBAL_QUEST_GRACE_MINUTES": "0",
        })
        self.env.start(); self.addCleanup(self.env.stop)
        self.event = g.publish_event(self.db, self.uid, payload(self.org))
        self.event_ref = self.db.collection(g.EVENTS).document(self.event.id)
        self.addCleanup(self.event_ref.delete)
        self.claim_ref = self.user_ref.collection(g.CLAIMS).document(self.event.id)
        self.addCleanup(self.claim_ref.delete)
        self.position = g.CheckIn(latitude=29.65, longitude=-82.34, accuracy=10)

    def balances(self):
        return self.user_ref.get().to_dict()["xp"], self.dorm_ref.get().to_dict()["xp"]

    def test_atomic_check_in_awards_user_and_dorm_once_and_keeps_personal_quests(self):
        personal = self.user_ref.collection("sidequests").document("unchanged")
        personal.set({"title": "Personal quest"}); self.addCleanup(personal.delete)
        result = g.check_in(self.db, self.uid, self.event.id, self.position)
        self.assertEqual(result["xpAwarded"], 25)
        self.assertEqual(self.balances(), (35, 125))
        self.assertTrue(personal.get().exists)
        self.assertEqual(self.user_ref.get().to_dict()["preferences"], "Keep me")
        with self.assertRaises(HTTPException) as caught:
            g.check_in(self.db, self.uid, self.event.id, self.position)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.balances(), (35, 125))

    def test_concurrent_check_ins_award_exactly_once(self):
        def attempt():
            try: return g.check_in(self.db, self.uid, self.event.id, self.position)["status"]
            except HTTPException as error: return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: attempt(), range(2)))
        self.assertCountEqual(results, ["completed", 409])
        self.assertEqual(self.balances(), (35, 125))

    def test_server_time_rejects_early_and_late_without_writes(self):
        for now in [self.event.startsAt - timedelta(seconds=1), self.event.endsAt + timedelta(seconds=1)]:
            with patch.object(g, "utc_now", return_value=now), self.assertRaises(HTTPException) as caught:
                g.check_in(self.db, self.uid, self.event.id, self.position)
            self.assertEqual(caught.exception.status_code, 409)
            self.assertEqual(self.balances(), (10, 100))
            self.assertFalse(self.claim_ref.get().exists)

    def test_gps_missing_far_and_inaccurate_never_award(self):
        for position in [g.CheckIn(), g.CheckIn(latitude=30, longitude=-82, accuracy=5),
                         g.CheckIn(latitude=29.65, longitude=-82.34, accuracy=90)]:
            with self.assertRaises(HTTPException):
                g.check_in(self.db, self.uid, self.event.id, position)
            self.assertEqual(self.balances(), (10, 100))
            self.assertFalse(self.claim_ref.get().exists)

    def test_config_is_snapshotted_and_explicit_honor_mode_is_supported(self):
        with patch.dict(os.environ, {"GLOBAL_QUEST_DEFAULT_XP": "40", "GLOBAL_QUEST_VERIFICATION_MODE": "honor"}):
            event = g.publish_event(self.db, self.uid, payload(self.org))
        self.addCleanup(self.db.collection(g.EVENTS).document(event.id).delete)
        self.addCleanup(self.user_ref.collection(g.CLAIMS).document(event.id).delete)
        self.assertEqual(self.event.verificationMode, "gps")
        self.assertEqual(g.check_in(self.db, self.uid, event.id, g.CheckIn())["xpAwarded"], 40)

    def test_non_admin_and_revoked_admin_cannot_publish(self):
        for uid in ["not-an-admin", self.uid]:
            if uid == self.uid: self.org_ref.update({"adminUserIds": []})
            with self.assertRaises(HTTPException) as caught:
                g.publish_event(self.db, uid, payload(self.org))
            self.assertEqual(caught.exception.status_code, 403)

    def test_bad_dorm_balance_rolls_back_claim_and_user_xp(self):
        self.dorm_ref.update({"xp": -1})
        with self.assertRaises(HTTPException):
            g.check_in(self.db, self.uid, self.event.id, self.position)
        self.assertEqual(self.user_ref.get().to_dict()["xp"], 10)
        self.assertFalse(self.claim_ref.get().exists)


    def test_cancelled_events_are_hidden_from_both_feeds(self):
        self.event_ref.update({'status': 'cancelled'})
        self.assertNotIn(self.event.id, [event.id for event in g.list_public_events(self.db)])
        self.assertNotIn(self.event.id, [event['id'] for event in g.list_events(self.uid,self.db)['quests']])

    def test_feed_returns_admin_options_event_and_completion_status(self):
        result = g.list_events(self.uid, self.db)
        self.assertIn({"id": self.org, "name": "Test Organization"}, result["organizations"])
        self.assertFalse(next(event for event in result["quests"] if event["id"] == self.event.id)["completed"])
        g.check_in(self.db, self.uid, self.event.id, self.position)
        result = g.list_events(self.uid, self.db)
        self.assertTrue(next(event for event in result["quests"] if event["id"] == self.event.id)["completed"])
        self.assertEqual(g.list_events("non-admin", self.db)["organizations"], [])
