"""Contract examples and trust-boundary validation; no app or Firebase needed."""

import json
import unittest
from copy import deepcopy
from pathlib import Path

from pydantic import ValidationError

from backend.quests.quest_contracts import (
    AssignQuestRequest, AssignQuestResponse, GenerateQuestRequest,
    GeminiMultiStopDraft, NormalizedQuestPreferences,
)


CONTRACTS = Path(__file__).resolve().parents[1] / "contracts"


class NormalizedPreferenceTests(unittest.TestCase):
    def setUp(self):
        self.body = json.loads((CONTRACTS / "assignment.normalized.example.json").read_text())

    def test_documented_request_round_trips_as_json(self):
        request = NormalizedQuestPreferences.model_validate(self.body)
        self.assertEqual(request.time.maxMinutes, 60)
        self.assertEqual(request.budget.maxDollars, 0)
        self.assertEqual(NormalizedQuestPreferences.model_validate_json(request.model_dump_json()), request)

    def test_current_frontend_can_send_a_place_label_without_coordinates(self):
        request = NormalizedQuestPreferences.model_validate(self.body)
        self.assertEqual(request.location.label, "UF campus")
        self.assertIsNone(request.location.coordinates)

    def test_time_control_meanings(self):
        for time in [{}, {"maxMinutes": 30}, {"maxMinutes": 60},
                     {"minMinutes": 120}, {"maxMinutes": 45}]:
            with self.subTest(time=time):
                self.body["time"] = time
                parsed = NormalizedQuestPreferences.model_validate(self.body).time
                self.assertEqual(parsed.minMinutes, time.get("minMinutes"))
                self.assertEqual(parsed.maxMinutes, time.get("maxMinutes"))

    def test_budget_control_meanings(self):
        for budget in [{}, {"maxDollars": 0}, {"maxDollars": 10, "maxExclusive": True},
                       {"minDollars": 10, "maxDollars": 25}, {"maxDollars": 12.50}]:
            with self.subTest(budget=budget):
                self.body["budget"] = budget
                parsed = NormalizedQuestPreferences.model_validate(self.body).budget
                self.assertEqual(parsed.maxDollars, budget.get("maxDollars"))
                self.assertEqual(parsed.maxExclusive, budget.get("maxExclusive", False))

    def test_anywhere_and_no_personalization_are_supported(self):
        request = NormalizedQuestPreferences.model_validate({"location": {"mode": "anywhere"},
                                                   "time": {}, "budget": {}})
        self.assertEqual(request.goals, [])
        self.assertEqual(request.preferences, "")
        self.assertIsNone(request.vibe)

    def test_current_location_requires_coordinates_and_accuracy(self):
        self.body["location"] = {"mode": "current", "coordinates": {
            "latitude": 29.65, "longitude": -82.34}, "accuracyMeters": 100}
        # Generation may use a coarse reading; completion's 50m limit is separate.
        self.assertEqual(NormalizedQuestPreferences.model_validate(self.body).location.accuracyMeters, 100)
        for missing in ["coordinates", "accuracyMeters"]:
            body = deepcopy(self.body)
            del body["location"][missing]
            with self.assertRaises(ValidationError):
                NormalizedQuestPreferences.model_validate(body)

    def test_rejects_invalid_ranges_and_numeric_coercion(self):
        for field, values in {
            "time": [{"minMinutes": 60, "maxMinutes": 30}, {"maxMinutes": 0},
                     {"maxMinutes": "60"}, {"maxMinutes": True}, {"maxMinutes": 1.5}],
            "budget": [{"minDollars": 25, "maxDollars": 10}, {"maxDollars": -1},
                       {"maxDollars": "10"}, {"maxDollars": True}, {"maxDollars": float("inf")},
                       {"maxDollars": float("nan")}, {"maxExclusive": True},
                       {"maxDollars": 0, "maxExclusive": True}],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                    NormalizedQuestPreferences.model_validate({**self.body, field: value})

    def test_rejects_invalid_or_inconsistent_locations(self):
        locations = [{"mode": "place", "label": "   "}, {"mode": "unknown"},
                     {"mode": "anywhere", "coordinates": {"latitude": 0, "longitude": 0}},
                     {"mode": "place", "label": "UF", "coordinates": {"latitude": 91, "longitude": 0}},
                     {"mode": "place", "label": "UF", "coordinates": {"latitude": 0, "longitude": "0"}},
                     {"mode": "current", "coordinates": {"latitude": 0, "longitude": 0}, "accuracyMeters": 0}]
        for location in locations:
            with self.subTest(location=location), self.assertRaises(ValidationError):
                NormalizedQuestPreferences.model_validate({**self.body, "location": location})

    def test_request_cannot_control_identity_rewards_or_assignment(self):
        for field, value in [("userId", "other"), ("uid", "other"), ("dormId", "other"),
                             ("xpReward", 999), ("status", "completed"), ("prompt", "override")]:
            with self.subTest(field=field), self.assertRaises(ValidationError):
                NormalizedQuestPreferences.model_validate({**self.body, field: value})

    def test_bounds_on_personalization_and_nested_extras(self):
        for change in [{"preferences": "x" * 4001}, {"goals": ["a"] * 21}, {"goals": [" "]},
                       {"goals": ["x" * 501]}, {"goals": "one goal"},
                       {"vibe": {"name": "Study", "preferences": "Quiet", "userId": "other"}},
                       {"vibe": {"name": "Study", "preferences": " "}}]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                NormalizedQuestPreferences.model_validate({**self.body, **change})


class FrontendPayloadTests(unittest.TestCase):
    def setUp(self):
        self.body = json.loads((CONTRACTS / "assignment.request.example.json").read_text())

    def test_teammate_example_normalizes_without_changing_identity(self):
        request = AssignQuestRequest.model_validate(self.body)
        normalized = request.normalize()
        self.assertEqual(normalized.location.label, self.body["location"])
        self.assertEqual(normalized.time.minMinutes, 120)
        self.assertIsNone(normalized.time.maxMinutes)
        self.assertEqual(normalized.budget.minDollars, 10)
        self.assertEqual(normalized.budget.maxDollars, 25)
        self.assertEqual(normalized.vibe.preferences, self.body["vibePreferences"])
        self.assertEqual(normalized.goals, self.body["goals"])
        self.assertNotIn("username", normalized.model_dump())
        self.assertEqual(AssignQuestRequest.model_validate_json(request.model_dump_json()), request)

    def test_proof_options_allow_one_or_multiple_unique_choices(self):
        for choices in [["location"], ["location", "photo"], ["recreation"]]:
            with self.subTest(choices=choices):
                request = AssignQuestRequest.model_validate({**self.body, "proofOptions": choices})
                self.assertEqual(request.normalize().proofOptions, choices)
        for choices in [[], ["photo", "photo"], ["camera"], ["location", "recreation"]]:
            with self.subTest(choices=choices), self.assertRaises(ValidationError):
                AssignQuestRequest.model_validate({**self.body, "proofOptions": choices})

    def test_activity_time_options_preserve_their_meanings(self):
        for selection, custom, minimum, maximum in [
            ("any", None, None, None), ("", None, None, None), ("30", None, None, 30),
            ("60", None, None, 60), ("120", None, 120, None), ("custom", 45, None, 45),
        ]:
            with self.subTest(selection=selection):
                self.body["time"] = {"selection": selection, "customMinutes": custom}
                time = AssignQuestRequest.model_validate(self.body).normalize().time
                self.assertEqual((time.minMinutes, time.maxMinutes), (minimum, maximum))

    def test_budget_options_preserve_free_exclusive_and_range_limits(self):
        for selection, custom, minimum, maximum, exclusive in [
            ("any", None, 0, None, False), ("", None, 0, None, False),
            ("0", None, 0, 0, False), ("10", None, 0, 10, True),
            ("10-25", None, 10, 25, False), ("custom", 12.5, 0, 12.5, False),
            ("custom", 0, 0, 0, False),
        ]:
            with self.subTest(selection=selection):
                self.body["budget"] = {"selection": selection, "customDollars": custom}
                budget = AssignQuestRequest.model_validate(self.body).normalize().budget
                self.assertEqual((budget.minDollars, budget.maxDollars, budget.maxExclusive),
                                 (minimum, maximum, exclusive))

    def test_distance_is_independent_of_activity_duration(self):
        for distance in [None, 0.5, 2, 10]:
            self.body["distance"] = distance
            normalized = AssignQuestRequest.model_validate(self.body).normalize()
            self.assertEqual(normalized.maxDistanceMiles, distance)
            self.assertEqual(normalized.time.minMinutes, 120)

    def test_frontend_distance_object_and_null_vibe_normalize_like_legacy_payload(self):
        frontend = {**self.body, "distance": {"maxDistance": 1, "unit": "miles"}, "vibePreferences": None}
        parsed = AssignQuestRequest.model_validate(frontend).normalize()
        legacy = AssignQuestRequest.model_validate({**frontend, "distance": 1, "vibePreferences": ""}).normalize()
        self.assertEqual(parsed, legacy)
        self.assertEqual(parsed.maxDistanceMiles, 1)
        self.assertIsNone(parsed.vibe)

    def test_distance_objects_keep_strict_units_numbers_and_positive_bounds(self):
        for distance in [{"maxDistance": 1, "unit": "km"}, {"maxDistance": 1},
                         {"maxDistance": 0, "unit": "miles"}, {"maxDistance": True, "unit": "miles"},
                         {"maxDistance": "1", "unit": "miles"},
                         {"maxDistance": 1, "unit": "miles", "extra": 1}]:
            with self.subTest(distance=distance), self.assertRaises(ValidationError):
                AssignQuestRequest.model_validate({**self.body, "distance": distance})

    def test_distance_object_still_requires_numeric_origin_for_generation(self):
        frontend = {**self.body, "distance": {"maxDistance": 1, "unit": "miles"}, "vibePreferences": None}
        with self.assertRaisesRegex(ValidationError, "originCoordinates"):
            GenerateQuestRequest.model_validate(frontend)
        generated = GenerateQuestRequest.model_validate({**frontend, "originCoordinates": {
            "latitude": 29.65, "longitude": -82.34,
        }}).normalize()
        self.assertEqual(generated.maxDistanceMiles, 1)
        self.assertEqual(generated.location.coordinates.latitude, 29.65)

    def test_frontend_not_selected_label_means_anywhere(self):
        self.assertEqual(AssignQuestRequest.model_validate({**self.body, "location": "Not selected"})
                         .normalize().location.mode, "anywhere")

    def test_distance_needs_a_search_origin(self):
        for label in ["", "any", "Anywhere", "  anywhere  "]:
            self.body.update(location=label, distance=None)
            self.assertEqual(AssignQuestRequest.model_validate(self.body).normalize().location.mode, "anywhere")
            self.body["distance"] = 2
            with self.assertRaises(ValidationError):
                AssignQuestRequest.model_validate(self.body)

    def test_multi_stop_requires_a_selected_origin(self):
        self.body.update(location="UF campus", multiQuest=True)
        with self.assertRaisesRegex(ValidationError, "originCoordinates"):
            GenerateQuestRequest.model_validate(self.body)
        self.body["originCoordinates"] = {"latitude": 29.65, "longitude": -82.34}
        request = GenerateQuestRequest.model_validate(self.body).normalize()
        self.assertTrue(request.multiQuest)
        self.assertEqual(request.location.coordinates.latitude, 29.65)

    def test_emailed_address_link_uses_label_without_following_url(self):
        self.body["location"] = "[101 Museum Rd, Gainesville, FL 32603, USA](https://www.google.com/maps/search/101+Museum+Rd?entry=gmail&source=g)"
        normalized = AssignQuestRequest.model_validate(self.body).normalize()
        self.assertEqual(normalized.location.label, "101 Museum Rd, Gainesville, FL 32603, USA")
        self.assertIsNone(normalized.location.coordinates)

    def test_invalid_filters_are_rejected_before_normalization(self):
        for field, values in {
            "time": [{"selection": "custom"}, {"selection": "custom", "customMinutes": "45"},
                     {"selection": "custom", "customMinutes": 0}, {"selection": "custom", "customMinutes": True},
                     {"selection": "90"}, {"selection": 120}],
            "budget": [{"selection": "custom"}, {"selection": "custom", "customDollars": -1},
                       {"selection": "custom", "customDollars": "12.5"}, {"selection": "custom", "customDollars": True},
                       {"selection": "custom", "customDollars": float("inf")}, {"selection": "25"}],
            "distance": [0, -1, "2", True, float("nan"), float("inf"), {"miles": 2}],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                    AssignQuestRequest.model_validate({**self.body, field: value})

    def test_inactive_custom_values_do_not_override_selected_controls(self):
        self.body["time"] = {"selection": "30", "customMinutes": 90}
        self.body["budget"] = {"selection": "0", "customDollars": 25}
        normalized = AssignQuestRequest.model_validate(self.body).normalize()
        self.assertEqual(normalized.time.maxMinutes, 30)
        self.assertEqual(normalized.budget.maxDollars, 0)

    def test_client_cannot_supply_trusted_fields(self):
        for field, value in [("uid", "other"), ("userId", "other"), ("xpReward", 999),
                             ("dormId", "other"), ("status", "completed"), ("prompt", "override")]:
            with self.subTest(field=field), self.assertRaises(ValidationError):
                AssignQuestRequest.model_validate({**self.body, field: value})

    def test_personalization_remains_bounded_and_optional(self):
        self.body.update(preferences="", goals=[], vibePreferences="")
        self.assertIsNone(AssignQuestRequest.model_validate(self.body).normalize().vibe)
        for change in [{"preferences": "x" * 4001}, {"username": "x" * 161},
                       {"goals": [" "]}, {"goals": ["a"] * 21}, {"vibePreferences": "x" * 4001}]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                AssignQuestRequest.model_validate({**self.body, **change})


class ResponseContractTests(unittest.TestCase):
    def setUp(self):
        self.body = json.loads((CONTRACTS / "assignment.response.example.json").read_text())

    def test_documented_saved_assignment(self):
        response = AssignQuestResponse.model_validate(self.body)
        self.assertEqual(response.assignment.status, "assigned")
        self.assertEqual(response.assignment.xpAwarded, 0)
        self.assertIsNotNone(response.assignment.assignedAt.tzinfo)
        self.assertEqual(AssignQuestResponse.model_validate_json(response.model_dump_json()), response)

    def test_reused_assignment_is_explicit(self):
        self.body["reusedExisting"] = True
        self.assertTrue(AssignQuestResponse.model_validate(self.body).reusedExisting)

    def test_matching_ids_are_required(self):
        for change in [{"questId": "another"}, {"id": "wrong-document-id"}]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                AssignQuestResponse.model_validate({**self.body, "assignment": {
                    **self.body["assignment"], **change}})
        self.body["assignment"].update(questId="another", id="example-user_another")
        with self.assertRaises(ValidationError):
            AssignQuestResponse.model_validate(self.body)

    def test_cannot_return_completed_or_awarded_assignment(self):
        for change in [{"status": "completed"}, {"xpAwarded": 25}, {"xpAwarded": False},
                       {"completedAt": "2026-10-17T15:00:00Z"}, {"assignedAt": "2026-10-17T15:00:00"}]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                AssignQuestResponse.model_validate({**self.body, "assignment": {
                    **self.body["assignment"], **change}})

    def test_invalid_destination_or_reward_is_not_displayable_as_valid_quest(self):
        for change in [{"latitude": 91}, {"radiusMeters": 0}, {"xpReward": True},
                       {"xpReward": -1}, {"xpReward": 2**63}, {"isActive": False},
                       {"isActive": 1}, {"estimatedMinutes": 0}, {"estimatedCostDollars": -1},
                       {"estimatedCostDollars": float("nan")}, {"steps": []}]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                AssignQuestResponse.model_validate({**self.body, "quest": {**self.body["quest"], **change}})


class MultiStopGenerationContractTests(unittest.TestCase):
    def test_ten_stops_and_actions_are_supported_without_a_fixed_three_step_shape(self):
        draft = GeminiMultiStopDraft.model_validate({
            "title": "A connected ten-stop mission",
            "description": "Build one result from distinct local discoveries.",
            "steps": [f"Complete stage {index + 1}." for index in range(10)],
            "stepProofMethods": ["location"] * 10,
            "stepDestinationIndexes": list(range(10)),
            "routeCandidateIndexes": list(range(10)),
            "estimatedMinutes": 120,
            "estimatedCostDollars": 0.0,
            "completionCriteria": "you have connected all ten discoveries",
        })
        self.assertEqual(len(draft.steps), 10)
        self.assertEqual(draft.routeCandidateIndexes, list(range(10)))

    def test_multi_stop_output_rejects_more_than_ten_actions_or_destinations(self):
        values = {
            "title": "A connected mission",
            "description": "Build one result from local discoveries.",
            "steps": [f"Complete stage {index + 1}." for index in range(10)],
            "stepProofMethods": ["location"] * 10,
            "stepDestinationIndexes": list(range(10)),
            "routeCandidateIndexes": list(range(10)),
            "estimatedMinutes": 120,
            "estimatedCostDollars": 0.0,
            "completionCriteria": "you have connected all discoveries",
        }
        with self.assertRaises(ValidationError):
            GeminiMultiStopDraft.model_validate({
                **values,
                "steps": [*values["steps"], "Complete one more stage."],
                "stepProofMethods": ["location"] * 11,
                "stepDestinationIndexes": list(range(11)),
            })
        with self.assertRaises(ValidationError):
            GeminiMultiStopDraft.model_validate({
                **values,
                "routeCandidateIndexes": list(range(11)),
            })


if __name__ == "__main__":
    unittest.main()
