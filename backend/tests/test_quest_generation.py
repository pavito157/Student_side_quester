"""Exercise actual generation, HTTP parsing, contracts and route without paid calls."""

import json
import os
import unittest
from unittest.mock import MagicMock, patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.auth import firebase_helpers
from backend.quests import quest_generation as generation
from backend.quests.quest_contracts import GenerateQuestRequest, GeneratedQuestProposal, ResolvedDestination, SelectedDestination
from main import app

HTTP_CLIENT = httpx.Client


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.body = {"location": "UF campus", "time": {"selection": "60"},
                     "budget": {"selection": "0"}, "preferences": "Nature and programming",
                     "username": "Private Student", "goals": ["Learn"], "vibePreferences": "Relax",
                     "proofOptions": ["location", "photo"]}
        self.preferences = GenerateQuestRequest.model_validate(self.body).normalize()
        self.destination = ResolvedDestination(locationName="Verified campus place", latitude=29.64,
                                               longitude=-82.35, scope="gainesville_city", placeId="place-123")
        self.proposal = {"title": "Plant patterns", "locationName": "Proposed garden",
                         "locationAddress": "Proposed UF campus address",
                         "description": "Observe repeating patterns in plants.",
                         "steps": ["Observe three plants.", "Sketch a pattern."],
                         "estimatedMinutes": 30, "estimatedCostDollars": 0}
        self.environment = patch.dict(os.environ, {"GEMINI_API_KEY": "secret-test-key",
                                                   "GEMINI_MODEL": "gemini-3.8-flash",
                                                   "GEMINI_TIMEOUT_SECONDS": "90"})
        self.environment.start()
        self.addCleanup(patch.stopall)

    def http(self, status=200, body=None, handler=None):
        if body is None:
            body = {"candidates": [{"finishReason": "STOP", "content": {
                "parts": [{"text": json.dumps(self.provider_draft())}]}}]}
        self.requests = []

        def respond(request):
            self.requests.append(request)
            return handler(request) if handler else httpx.Response(status, json=body)

        client = HTTP_CLIENT(transport=httpx.MockTransport(respond))
        self.addCleanup(client.close)
        patch.object(generation, "get_gemini_http_client", return_value=client).start()

    def provider_draft(self):
        return {
            **self.proposal,
            "stepProofMethods": ["location", "photo"],
            "stepDestinationIndexes": [0, 0],
            "completionCriteria": "you have three labeled sketches.",
        }

    def generate(self, resolver=None):
        return generation.generate_preview(self.preferences, resolver)

    def assert_status(self, code, function):
        with self.assertRaises(HTTPException) as caught:
            function()
        self.assertEqual(caught.exception.status_code, code)
        self.assertNotIn("secret-test-key", str(caught.exception.detail))

    def test_valid_generation_needs_no_catalog_and_is_explicitly_unverified(self):
        self.http()
        with patch.object(firebase_helpers, "get_db", side_effect=AssertionError("No Firestore")):
            result = self.generate()
        self.assertEqual(result.mode, "generated")
        self.assertFalse(result.saved)
        self.assertFalse(result.filtersApplied)
        self.assertFalse(result.destinationVerified)
        self.assertIsNone(result.destination)
        self.assertEqual(result.distanceStatus, "not_requested")
        self.assertEqual(result.quest.title, "Plant patterns")
        self.assertEqual(result.quest.steps[-1], "Sketch a pattern. You're done when you have three labeled sketches.")
        self.assertEqual(result.quest.stepProofMethods, ["location", "photo"])
        self.assertNotIn("completionCriteria", result.quest.model_dump())
        for forbidden in ["id", "sourceQuestId", "latitude", "longitude", "radiusMeters", "xpReward"]:
            self.assertNotIn(forbidden, result.quest.model_dump())
        self.assertNotIn("assignment", result.model_dump())

    def test_prompt_retains_preferences_but_omits_identity_exact_gps_and_secrets(self):
        self.preferences = GenerateQuestRequest.model_validate({
            **self.body, "originCoordinates": {"latitude": 29.64, "longitude": -82.35},
        }).normalize()
        self.http()
        self.generate()
        request = self.requests[0]
        self.assertEqual(request.headers["x-goog-api-key"], "secret-test-key")
        self.assertNotIn("key=", str(request.url))
        body = json.loads(request.content)
        context = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(context["goals"], ["Learn"])
        self.assertEqual(context["location"]["label"], "UF campus")
        for forbidden in ["Private Student", "secret-test-key", "latitude", "xpReward", "catalog"]:
            self.assertNotIn(forbidden, json.dumps(context))
        self.assertIn("schema", body["generationConfig"]["responseFormat"]["text"])
        self.assertEqual(body["generationConfig"]["responseFormat"]["text"]["mimeType"], "APPLICATION_JSON")
        self.assertEqual(body["generationConfig"]["thinkingConfig"], {"thinkingLevel": "LOW"})
        self.assertIn("exactly one stepProofMethods and one stepDestinationIndexes", body["systemInstruction"]["parts"][0]["text"])
        self.assertIn("concrete, visible artifact", body["systemInstruction"]["parts"][0]["text"])
        self.assertIn("location, photo", body["systemInstruction"]["parts"][0]["text"])
        self.assertIn("about 70%", body["systemInstruction"]["parts"][0]["text"])
        self.assertEqual(context["proofOptions"], ["location", "photo"])

    def test_generation_rejects_methods_outside_user_selected_options(self):
        self.preferences = GenerateQuestRequest.model_validate({
            **self.body, "proofOptions": ["location"],
        }).normalize()
        self.http()
        self.assert_status(502, self.generate)

    def test_provider_wait_is_configurable_and_connect_timeout_stays_short(self):
        for seconds in [90, 120, 10]:
            with self.subTest(seconds=seconds), patch.dict(os.environ, {"GEMINI_TIMEOUT_SECONDS": str(seconds)}):
                self.http()
                self.generate()
                timeout = self.requests[-1].extensions["timeout"]
                self.assertEqual(timeout["read"], seconds)
                self.assertEqual(timeout["connect"], 5)

    def test_model_settings_use_gemini_flash_with_low_thinking(self):
        with patch.dict(os.environ, {"GEMINI_MODEL": "gemini-3.8-flash"}):
            self.http()
            self.generate()
            config = json.loads(self.requests[0].content)["generationConfig"]
            self.assertEqual(config["thinkingConfig"]["thinkingLevel"], "LOW")
            self.assertEqual(config["maxOutputTokens"], 3072)

    def test_model_default_is_gemini_flash(self):
        with patch.dict(os.environ, {
            "GEMINI_API_KEY": "secret-test-key",
            "GEMINI_TIMEOUT_SECONDS": "20",
        }, clear=True):
            self.http()
            self.generate()
            self.assertIn(
                "/models/gemini-3.8-flash:generateContent",
                str(self.requests[0].url),
            )

    def test_truncated_and_safety_blocked_responses_have_actionable_errors(self):
        for finish_reason, message in [
            ("MAX_TOKENS", "Gemini's response was cut off."),
            ("SAFETY", "Gemini blocked this quest request."),
        ]:
            with self.subTest(finish_reason=finish_reason):
                self.http(body={"candidates": [{"finishReason": finish_reason}]})
                with self.assertRaises(HTTPException) as caught:
                    self.generate()
                self.assertEqual(caught.exception.status_code, 502)
                self.assertIn(message, caught.exception.detail)

    def test_connection_pool_is_reused_and_closed_at_shutdown(self):
        generation.close_gemini_http_client()
        with patch.object(generation.httpx, "Client") as factory:
            first = generation.get_gemini_http_client()
            self.assertIs(generation.get_gemini_http_client(), first)
            factory.assert_called_once_with(follow_redirects=False)
            generation.close_gemini_http_client()
            first.close.assert_called_once()
            self.assertEqual(generation.get_gemini_http_client.cache_info().currsize, 0)

    def test_invalid_timeout_configuration_does_not_call_provider(self):
        with patch.object(generation, "get_gemini_http_client") as client:
            for value in ["nan", "inf", "0", "121", "invalid"]:
                with self.subTest(value=value), patch.dict(os.environ, {"GEMINI_TIMEOUT_SECONDS": value}):
                    self.assert_status(503, self.generate)
            client.assert_not_called()

    def test_missing_key_or_invalid_model_does_not_call_provider(self):
        with patch.object(generation, "get_gemini_http_client") as client:
            with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
                self.assert_status(503, self.generate)
            with patch.dict(os.environ, {"GEMINI_MODEL": "../malicious?key=foo"}):
                self.assert_status(503, self.generate)
            client.assert_not_called()

    def test_quota_and_provider_error_responses_are_sanitized(self):
        for provider, expected in [(429, 429), (400, 503), (403, 503), (500, 503)]:
            with self.subTest(provider=provider):
                self.http(provider, {"error": "secret-test-key and private prompt"})
                self.assert_status(expected, self.generate)

    def test_timeout_and_connection_failures_are_mapped(self):
        for error, status in [(httpx.ReadTimeout("secret-test-key"), 504),
                              (httpx.ConnectError("secret-test-key"), 503)]:
            def fail(request):
                raise error
            self.http(handler=fail)
            self.assert_status(status, self.generate)

    def test_blocked_truncated_malformed_and_extra_fields_are_rejected(self):
        for body in [
            {}, [], {"candidates": ["malformed"]}, {"candidates": []},
            {"candidates": [{"finishReason": "SAFETY"}]},
            {"candidates": [{"finishReason": "MAX_TOKENS"}]},
            {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "not JSON"}]}}]},
            {"candidates": [{"finishReason": "STOP", "content": {"parts": [
                {"text": json.dumps({**self.provider_draft(), "xpReward": 999})}]}}]},
        ]:
            with self.subTest(body=body):
                self.http(body=body)
                self.assert_status(502, self.generate)

    def test_thought_text_is_not_part_of_result(self):
        self.http(body={"candidates": [{"finishReason": "STOP", "content": {"parts": [
            {"thought": True, "text": "internal thought"},
            {"text": json.dumps(self.provider_draft())},
        ]}}]})
        self.assertEqual(self.generate().quest.title, "Plant patterns")

    def test_ai_coordinates_and_rewards_are_rejected(self):
        for field in ["latitude", "longitude", "xpReward", "radiusMeters", "sourceQuestId"]:
            with self.subTest(field=field):
                original = self.proposal.copy()
                self.proposal[field] = 999
                self.http()
                self.assert_status(502, self.generate)
                self.proposal = original

    def test_verified_venue_uses_activity_only_schema_and_server_location_fields(self):
        self.proposal.pop("locationName")
        self.proposal.pop("locationAddress")
        self.http()
        selected = SelectedDestination(
            **self.destination.model_dump(), locationAddress="Canonical provider address",
        )
        result = generation.call_gemini(self.preferences, selected)
        self.assertEqual(result.locationName, selected.locationName)
        self.assertEqual(result.locationAddress, selected.locationAddress)
        body = json.loads(self.requests[0].content)
        fields = body["generationConfig"]["responseFormat"]["text"]["schema"]["properties"]
        self.assertNotIn("locationName", fields)
        self.assertNotIn("locationAddress", fields)
        context = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(context["verifiedDestination"], {
            "candidateIndex": 0,
            "locationName": selected.locationName,
            "locationAddress": selected.locationAddress,
            "rating": None,
            "userRatingCount": None,
            "priceLevel": None,
            "discoveryProfiles": [],
        })
        self.assertNotIn("latitude", json.dumps(context))
        self.assertNotIn("placeId", json.dumps(context))
        self.assertNotIn("xpReward", json.dumps(context))

    def test_multi_stop_prompt_combines_route_order_and_previous_activity_without_private_metadata(self):
        self.proposal.pop("locationName")
        self.proposal.pop("locationAddress")
        draft = {
            **self.provider_draft(),
            "steps": [
                "Use the first stop's architecture as the opening clue.",
                "Compare another detail at the first stop.",
                "Use the second stop to finish the pattern.",
            ],
            "stepProofMethods": ["location", "photo", "location"],
            "stepDestinationIndexes": [0, 0, 1],
            "routeCandidateIndexes": [0, 1],
        }
        self.http(body={"candidates": [{"finishReason": "STOP", "content": {
            "parts": [{"text": json.dumps(draft)}],
        }}]})
        first = SelectedDestination(**self.destination.model_dump(), locationAddress="First provider address")
        second = first.model_copy(update={"locationName": "Second venue", "locationAddress": "Second provider address",
                                          "latitude": 29.65, "longitude": -82.34, "placeId": "second-id"})
        previous = GeneratedQuestProposal(**{**self.proposal, "locationName": "Previous venue", "locationAddress": "Previous address"})
        result = generation.call_gemini(self.preferences, [first, second], previous_quest=previous)
        self.assertEqual(len(result.steps), 3)
        self.assertEqual(result.routeCandidateIndexes, [0, 1])
        self.assertEqual(result.stepDestinationIndexes, [0, 0, 1])
        body = json.loads(self.requests[-1].content)
        instruction = body["systemInstruction"]["parts"][0]["text"]
        self.assertIn("2-10 distinct candidateIndex values", instruction)
        self.assertIn("different primary challenge", instruction)
        self.assertNotIn("Keep every required step\nat that one destination", instruction)
        context = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(len(context["verifiedDestinationCandidates"]), 2)
        self.assertEqual(context["previousActivity"]["steps"], previous.steps)
        for field in ["latitude", "longitude", "placeId", "xpReward", "Private Student"]:
            self.assertNotIn(field, json.dumps(context))

    def test_city_scope_and_adventure_rules_do_not_reselect_a_verified_destination(self):
        self.http()
        generation.call_gemini(self.preferences)
        draft_body = json.loads(self.requests[-1].content)
        draft_instruction = draft_body["systemInstruction"]["parts"][0]["text"]
        self.assertIn("Gainesville, Florida city limits", draft_instruction)
        self.assertIn("full street address", draft_instruction)
        self.assertNotIn("University of Florida campus", draft_instruction)
        self.proposal.pop("locationName")
        self.proposal.pop("locationAddress")
        self.http()
        selected = SelectedDestination(**self.destination.model_dump(), locationAddress="Provider address")
        generation.call_gemini(self.preferences, selected)
        body = json.loads(self.requests[-1].content)
        instruction = body["systemInstruction"]["parts"][0]["text"]
        self.assertIn("Use only that place", instruction)
        self.assertIn("Do not invent or return location fields", instruction)
        self.assertNotIn("full street address", instruction)
        self.assertNotIn("Choose one real", instruction)
        for rules in [draft_instruction, instruction]:
            self.assertIn("not a generic visit", rules)
            self.assertIn("measurable finished result", rules)
            self.assertIn("cannot prove the activity was performed", rules)
        # Prompt improvements must not change the response contract or latency controls.
        self.assertEqual(body["generationConfig"]["candidateCount"], 1)
        self.assertEqual(body["generationConfig"]["maxOutputTokens"], 3072)

    def test_replacement_prompt_contains_activity_but_no_previous_identity_or_gps(self):
        from types import SimpleNamespace
        previous = SimpleNamespace(title="Old quest", description="Old challenge", steps=["Old action"],
                                   id="private-quest-id", latitude=29.65, longitude=-82.34, xpReward=25)
        self.proposal.pop("locationName")
        self.proposal.pop("locationAddress")
        self.http()
        selected = SelectedDestination(**self.destination.model_dump(), locationAddress="Provider address")
        generation.call_gemini(self.preferences, selected, previous_quest=previous)
        body = json.loads(self.requests[-1].content)
        context = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(context["previousActivity"], {
            "title": "Old quest", "description": "Old challenge", "steps": ["Old action"],
        })
        self.assertIn("different primary challenge", body["systemInstruction"]["parts"][0]["text"])
        for forbidden in ["private-quest-id", "latitude", "xpReward"]:
            self.assertNotIn(forbidden, json.dumps(context))

    def test_identical_replacement_activity_is_rejected_before_persistence(self):
        from types import SimpleNamespace
        previous = SimpleNamespace(
            title="Old title", description=self.proposal["description"],
            steps=[self.proposal["steps"][0],
                   "Sketch a pattern. You're done when you have three labeled sketches."],
        )
        self.http()
        self.assert_status(502, lambda: generation.generate_preview(self.preferences, previous_quest=previous))

    def test_time_budget_and_two_plus_hours_are_enforced(self):
        for time, budget, minutes, cost, valid in [
            ("60", "0", 60, 0, True), ("60", "0", 61, 0, False),
            ("120", "0", 119, 0, False), ("120", "0", 120, 0, True),
            ("any", "10", 30, 10, False), ("any", "10", 30, 9.99, True),
            ("any", "10-25", 30, 9, False), ("any", "10-25", 30, 25, True),
            ("any", "10-25", 30, 26, False), ("any", "0", 30, 1, False),
        ]:
            with self.subTest(time=time, budget=budget, minutes=minutes, cost=cost):
                self.preferences = GenerateQuestRequest.model_validate({
                    **self.body, "time": {"selection": time}, "budget": {"selection": budget},
                }).normalize()
                self.proposal.update(estimatedMinutes=minutes, estimatedCostDollars=cost)
                self.http()
                if valid:
                    self.generate()
                else:
                    self.assert_status(502, self.generate)

    def test_resolver_supplies_verified_coordinates_and_distance_is_checked_in_miles(self):
        self.preferences = GenerateQuestRequest.model_validate({
            **self.body, "distance": 1,
            "originCoordinates": {"latitude": 29.64, "longitude": -82.35},
        }).normalize()
        for latitude, allowed in [(29.64, True), (29.65, True), (29.66, False)]:
            with self.subTest(latitude=latitude):
                resolver = MagicMock(return_value=self.destination.model_copy(update={"latitude": latitude}))
                self.http()
                if allowed:
                    result = self.generate(resolver)
                    self.assertTrue(result.destinationVerified)
                    self.assertTrue(result.filtersApplied)
                    self.assertEqual(result.distanceStatus, "verified")
                    self.assertEqual(result.destination.latitude, latitude)
                    self.assertGreaterEqual(result.distanceMeters, 0)
                else:
                    self.assert_status(409, lambda: self.generate(resolver))
                resolver.assert_called_once_with("Proposed garden", "Proposed UF campus address")

    def test_no_resolver_keeps_requested_distance_pending(self):
        self.preferences = GenerateQuestRequest.model_validate({
            **self.body, "distance": 1,
            "originCoordinates": {"latitude": 29.64, "longitude": -82.35},
        }).normalize()
        self.http()
        result = self.generate()
        self.assertEqual(result.distanceStatus, "pending")
        self.assertFalse(result.filtersApplied)
        self.assertIsNone(result.distanceMeters)

    def test_resolver_failures_do_not_fall_back_to_unverified_success(self):
        for unavailable, status in [(False, 502), (True, 503)]:
            self.http()
            resolver = MagicMock(side_effect=generation.DestinationResolutionError(unavailable))
            self.assert_status(status, lambda: self.generate(resolver))
        for invalid in [None, {}, {**self.destination.model_dump(), "latitude": 91},
                        self.destination.model_copy(update={"latitude": float("nan")}),
                        {**self.destination.model_dump(), "scope": "off_campus"}]:
            self.http()
            self.assert_status(502, lambda: self.generate(MagicMock(return_value=invalid)))

    def test_distance_requires_real_numeric_origin_and_specific_label(self):
        for change in [
            {"distance": 2},
            {"distance": 2, "originCoordinates": {"latitude": "29.64", "longitude": -82.35}},
            {"distance": 2, "originCoordinates": {"latitude": 91, "longitude": -82.35}},
            {"location": "Anywhere", "originCoordinates": {"latitude": 29.64, "longitude": -82.35}},
        ]:
            with self.assertRaises(ValidationError):
                GenerateQuestRequest.model_validate({**self.body, **change})

    def test_route_uses_verified_uf_token_and_does_not_write_assignment(self):
        app.dependency_overrides[generation.get_destination_resolver] = (
            lambda: MagicMock(return_value=self.destination)
        )
        self.addCleanup(
            lambda: app.dependency_overrides.pop(
                generation.get_destination_resolver, None
            )
        )
        with TestClient(app) as client, \
                patch.object(firebase_helpers, "get_firebase_app"), \
                patch.object(firebase_helpers.auth, "verify_id_token", return_value={
                    "uid": "user_student", "email": "student@ufl.edu", "email_verified": True,
                }) as verify, \
                patch.object(firebase_helpers, "get_db", side_effect=AssertionError("No database access")) as db, \
                patch.object(generation, "call_gemini", return_value=GeneratedQuestProposal(**self.proposal)): 
            guest_response = client.post("/quests/generate", json=self.body)
            self.assertEqual(guest_response.status_code, 200, guest_response.text)
            self.assertFalse(guest_response.json()["saved"])
            db.assert_not_called()
            response = client.post("/quests/generate", json=self.body,
                                   headers={"Authorization": "Bearer test-token", "Origin": "http://localhost:5173"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(response.json()["saved"])
            self.assertEqual(response.headers["cache-control"], "no-store")
            timing = response.headers["server-timing"]
            for stage in ["auth", "gemini", "total"]:
                self.assertRegex(timing, rf"{stage};dur=\d+\.\d+")
            self.assertNotIn("test-token", timing)
            self.assertIn("Server-Timing", response.headers["access-control-expose-headers"])
            db.assert_not_called()
            verify.assert_called_once_with("test-token", check_revoked=True)
            verify.return_value.update(email="student@gmail.com", email_verified=False)
            self.assertEqual(client.post("/quests/generate", json=self.body,
                                        headers={"Authorization": "Bearer test-token"}).status_code, 403)
        

if __name__ == "__main__":
    unittest.main()
