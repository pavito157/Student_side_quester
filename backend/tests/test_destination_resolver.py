"""Offline tests. Shared-module doubles exist only during isolated loading."""
import importlib.util
import copy
import io
import json
import os
import sys
import tempfile
import types
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError


@dataclass
class ResolvedDestinationDouble:
    locationName: str
    latitude: float
    longitude: float
    placeId: str
    scope: str


class ResolutionErrorDouble(Exception):
    def __init__(self, unavailable=False):
        self.unavailable = unavailable


contracts = types.ModuleType("backend.quests.quest_contracts")
contracts.MAX_DESTINATION_CANDIDATES = 20
contracts.ResolvedDestination = ResolvedDestinationDouble
contracts.SelectedDestination = ResolvedDestinationDouble
generation = types.ModuleType("backend.quests.quest_generation")
generation.DestinationResolutionError = ResolutionErrorDouble
spec = importlib.util.spec_from_file_location(
    "resolver_under_test", Path(__file__).resolve().parents[1] / "quests/destination_resolver.py")
resolver = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"backend.quests.quest_contracts": contracts, "backend.quests.quest_generation": generation}):
    spec.loader.exec_module(resolver)


class ResolverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.boundary = Path(self.temp.name) / "boundary.json"
        # Deliberately synthetic geometry, NOT a UF boundary.
        self.boundary.write_text(json.dumps({"type": "Feature", "properties": {
            "scope": "gainesville_city", "source_url": "https://example.invalid/test-only",
            "reviewed_by": "test fixture", "reviewed_on": "2026-10-17"},
            "geometry": {"type": "Polygon", "coordinates": [
                [[-83, 29], [-82, 29], [-82, 30], [-83, 30], [-83, 29]]]}}))
        env = patch.dict(os.environ, {"GOOGLE_PLACES_API_KEY": "test-key",
                                     "GAINESVILLE_BOUNDARY_PATH": str(self.boundary)})
        env.start()
        self.addCleanup(env.stop)
        self.place = {"id": "place-1", "displayName": {"text": "Test Hall"},
                      "formattedAddress": "123 Test Road, Gainesville, FL, USA",
                      "location": {"latitude": 29.5, "longitude": -82.5}}
        self.network = patch.object(resolver, "urlopen")
        self.urlopen = self.network.start()
        self.addCleanup(self.network.stop)

    def resolve(self, payload):
        self.urlopen.return_value = io.BytesIO(json.dumps(payload).encode())
        return resolver.resolve_destination("Test Hall", self.place["formattedAddress"])

    def assert_rejected(self, payload, unavailable=False):
        with self.assertRaises(ResolutionErrorDouble) as caught:
            self.resolve(payload)
        self.assertEqual(caught.exception.unavailable, unavailable)

    def test_success(self):
        result = self.resolve({"places": [self.place]})
        self.assertEqual(result, ResolvedDestinationDouble("Test Hall", 29.5, -82.5, "place-1", "gainesville_city"))
        request = self.urlopen.call_args.args[0]
        self.assertEqual(json.loads(request.data)["textQuery"], "Test Hall, " + self.place["formattedAddress"])
        self.assertEqual(self.urlopen.call_args.kwargs["timeout"], 10)

    def test_real_uf_destination_with_mock_provider_and_synthetic_boundary(self):
        # Real destination/address; ID and coordinates are mock data, not a
        # Google response or evidence of membership in the actual UF campus.
        # https://union.ufl.edu/visit/location-parking-directions/
        self.place["displayName"]["text"] = "J. Wayne Reitz Union"
        self.place["formattedAddress"] = "655 Reitz Union Drive, Gainesville, FL 32611"
        self.urlopen.return_value = io.BytesIO(json.dumps({"places": [self.place]}).encode())
        result = resolver.resolve_destination("J. Wayne Reitz Union", self.place["formattedAddress"])
        self.assertEqual(result.locationName, "J. Wayne Reitz Union")
        self.assertEqual(result.scope, "gainesville_city")

    def test_one_clear_match_among_multiple_candidates(self):
        unrelated = copy.deepcopy(self.place)
        unrelated.update(id="other", displayName={"text": "Other Hall"})
        same_name_wrong_address = dict(self.place, id="other-address", formattedAddress="456 Other Road")
        result = self.resolve({"places": [unrelated, same_name_wrong_address, self.place]})
        self.assertEqual(result.placeId, "place-1")

    def test_duplicate_id_is_not_ambiguous(self):
        result = self.resolve({"places": [self.place, copy.deepcopy(self.place)]})
        self.assertEqual(result.placeId, "place-1")

    def test_conflicting_duplicate_id_is_unavailable(self):
        other = copy.deepcopy(self.place)
        other["location"]["latitude"] = 29.6
        self.assert_rejected({"places": [self.place, other]}, unavailable=True)

    def test_normalization(self):
        self.urlopen.return_value = io.BytesIO(json.dumps({"places": [self.place]}).encode())
        result = resolver.resolve_destination("  TEST HALL! ", self.place["formattedAddress"].upper())
        self.assertEqual(result.locationName, "Test Hall")

    def test_live_depot_park_regression_with_optional_country(self):
        # Regression from live diagnosis; network and GPS remain test doubles.
        self.place["displayName"]["text"] = "Depot Park"
        self.place["formattedAddress"] = "874 SE 4th St, Gainesville, FL 32601, USA"
        self.urlopen.return_value = io.BytesIO(json.dumps({"places": [self.place]}).encode())
        result = resolver.resolve_destination("Depot Park", "874 SE 4th St, Gainesville, FL 32601")
        self.assertEqual(result.locationName, "Depot Park")
        self.assertEqual(result.scope, "gainesville_city")
        self.assertEqual(self.urlopen.call_count, 1)

    def test_optional_us_country_spellings_are_symmetric(self):
        core = "123 Test Road, Gainesville, FL 32601"
        for suffix in ("", ", USA", ", US", ", U.S.A.", ", United States", ", United States of America"):
            for provider, proposed in [(core + suffix, core), (core, core + suffix)]:
                with self.subTest(provider=provider, proposed=proposed):
                    self.place["formattedAddress"] = provider
                    self.urlopen.return_value = io.BytesIO(json.dumps({"places": [self.place]}).encode())
                    self.assertEqual(resolver.resolve_destination("Test Hall", proposed).placeId, "place-1")

    def test_country_normalization_does_not_hide_address_conflicts(self):
        self.place["formattedAddress"] = "123 Test Road, Gainesville, FL 32601, USA"
        for proposed in [
            "124 Test Road, Gainesville, FL 32601",
            "123 Test Road, Gainesville, FL 32602",
            "123 Other Road, Gainesville, FL 32601",
            "123 Test Road, Gainesville, FL",
            "123 Test Road, Gainesville, FL 32601, Canada",
        ]:
            with self.subTest(proposed=proposed):
                self.urlopen.return_value = io.BytesIO(json.dumps({"places": [self.place]}).encode())
                with self.assertRaises(ResolutionErrorDouble):
                    resolver.resolve_destination("Test Hall", proposed)

    def test_country_variants_do_not_hide_ambiguous_distinct_places(self):
        self.place["formattedAddress"] = "123 Test Road, Gainesville, FL 32601, USA"
        other = {**self.place, "id": "another-place", "formattedAddress": "123 Test Road, Gainesville, FL 32601"}
        self.assert_rejected({"places": [self.place, other]})

    def test_unknown(self):
        self.assert_rejected({})

    def test_ambiguous(self):
        self.assert_rejected({"places": [self.place, dict(self.place, id="place-2")]})

    def test_outside(self):
        self.place["location"]["latitude"] = 31
        self.assert_rejected({"places": [self.place]})

    def test_outages(self):
        for error in (URLError("offline"), TimeoutError(),
                      HTTPError("https://example.invalid", 503, "outage", {}, None),
                      HTTPError("https://example.invalid", 429, "quota", {}, None)):
            with self.subTest(error=type(error).__name__):
                self.urlopen.side_effect = error
                with self.assertRaises(ResolutionErrorDouble) as caught:
                    resolver.resolve_destination("Test Hall", self.place["formattedAddress"])
                self.assertTrue(caught.exception.unavailable)

    def test_mismatched_name_or_address(self):
        for field, value in (("displayName", {"text": "Other Hall"}), ("formattedAddress", "Wrong address")):
            self.assert_rejected({"places": [dict(self.place, **{field: value})]})

    def test_unseen_page_rejected(self):
        self.assert_rejected({"places": [self.place], "nextPageToken": "more"})

    def test_invalid_coordinates(self):
        for value in (None, True, float("nan"), 91, "29.5"):
            self.place["location"]["latitude"] = value
            self.assert_rejected({"places": [self.place]}, unavailable=True)

    def test_bad_response(self):
        for payload in ({"error": {}}, {"places": None}, {"places": [{}]}, [], {"nextPageToken": 4}):
            self.assert_rejected(payload, unavailable=True)

    def test_incomplete_candidate_rejected_even_alongside_match(self):
        for field in ("id", "displayName", "formattedAddress", "location"):
            bad = copy.deepcopy(self.place)
            del bad[field]
            self.assert_rejected({"places": [self.place, bad]}, unavailable=True)

    def test_empty_provider_fields(self):
        for field, value in (("id", ""), ("displayName", {"text": " "}), ("formattedAddress", "")):
            self.assert_rejected({"places": [dict(self.place, **{field: value})]}, unavailable=True)

    def test_invalid_json(self):
        self.urlopen.return_value = io.BytesIO(b"not JSON")
        with self.assertRaises(ResolutionErrorDouble) as caught:
            resolver.resolve_destination("Test Hall", self.place["formattedAddress"])
        self.assertTrue(caught.exception.unavailable)

    def test_invalid_input_does_not_call_provider(self):
        for name in (None, "", " !!! ", 42):
            with self.assertRaises(ResolutionErrorDouble) as caught:
                resolver.resolve_destination(name, self.place["formattedAddress"])
            self.assertFalse(caught.exception.unavailable)
        self.urlopen.assert_not_called()

    def test_inside_outside_and_near_synthetic_boundary(self):
        for longitude, accepted in ((-82.5, True), (-83.1, False),
                                    (-83 + 1e-8, True), (-83 - 1e-8, False), (-83, False)):
            with self.subTest(longitude=longitude):
                self.place["location"]["longitude"] = longitude
                if accepted:
                    self.assertEqual(self.resolve({"places": [self.place]}).scope, "gainesville_city")
                else:
                    self.assert_rejected({"places": [self.place]})

    def test_malformed_boundary(self):
        original = json.loads(self.boundary.read_text())
        for geometry in (None, {"type": "Point", "coordinates": [0, 0]},
                         {"type": "Polygon", "coordinates": []},
                         {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [2, 2], [0, 0]]]}):
            feature = dict(original, geometry=geometry)
            self.boundary.write_text(json.dumps(feature))
            self.assert_rejected({}, unavailable=True)
        self.urlopen.assert_not_called()

    def test_multipolygon(self):
        feature = json.loads(self.boundary.read_text())
        feature["geometry"] = {"type": "MultiPolygon", "coordinates": [feature["geometry"]["coordinates"]]}
        self.boundary.write_text(json.dumps(feature))
        self.assertEqual(self.resolve({"places": [self.place]}).scope, "gainesville_city")

    def test_missing_boundary_fails_before_provider(self):
        self.boundary.unlink()
        self.assert_rejected({}, unavailable=True)
        self.urlopen.assert_not_called()

    def test_missing_key(self):
        with patch.dict(os.environ, {"GOOGLE_PLACES_API_KEY": ""}):
            self.assert_rejected({}, unavailable=True)
        self.urlopen.assert_not_called()

    def test_polygon_holes_and_edges(self):
        ring = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]
        self.assertTrue(resolver._ring_contains(ring, 2, 2))
        self.assertFalse(resolver._ring_contains(ring, 5, 2))
        self.assertIsNone(resolver._ring_contains(ring, 0, 2))
        feature = json.loads(self.boundary.read_text())
        feature["geometry"]["coordinates"].append(
            [[-82.6, 29.4], [-82.4, 29.4], [-82.4, 29.6], [-82.6, 29.6], [-82.6, 29.4]])
        self.boundary.write_text(json.dumps(feature))
        self.assert_rejected({"places": [self.place]})


if __name__ == "__main__":
    unittest.main()
