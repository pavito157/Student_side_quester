"""Verify before generation: real shared models and mocked provider I/O."""
import copy
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from backend import destination_resolver as resolver, quest_generation as generation
from backend.quest_contracts import GenerateQuestRequest, GeneratedQuestProposal, SelectedDestination


class DestinationSelectionTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        self.env = patch.dict(os.environ, {
            'GOOGLE_PLACES_API_KEY': 'test-only',
            'GAINESVILLE_BOUNDARY_PATH': str(Path(__file__).resolve().parents[1] / 'data/gainesville-boundary.geojson'),
        }).start()
        self.preferences = GenerateQuestRequest.model_validate({
            'location': 'Anywhere', 'time': {'selection': '60'}, 'budget': {'selection': '0'},
            'preferences': 'Enjoy nature',
        }).normalize()
        self.place = {
            'id': 'test-depot', 'displayName': {'text': 'Test park'},
            'formattedAddress': '123 Test Street, Gainesville, FL 32601, USA',
            'location': {'latitude': 29.6514, 'longitude': -82.3234},
        }
        self.search = patch.object(resolver, '_search', return_value={'places': [self.place]}).start()
        self.selector = resolver.VerifiedDestinationSelector()

    def test_provider_destination_is_selected_before_gemini_and_not_overwritten(self):
        proposal = GeneratedQuestProposal(
            title='Count three shapes', description='Find and count three leaf shapes.',
            steps=['Find three leaves.'], estimatedMinutes=20, estimatedCostDollars=0,
            locationName='Invented venue', locationAddress='999 Wrong Street',
        )
        def generate(preferences, selected):
            self.search.assert_called_once()  # Already verified before the AI call.
            self.assertEqual(selected.placeId, 'test-depot')
            return proposal
        with patch.object(generation, 'call_gemini', side_effect=generate) as provider:
            result = generation.generate_preview(self.preferences, self.selector)
        self.assertEqual(provider.call_count, 1)
        self.assertEqual(result.quest.locationName, 'Test park')
        self.assertEqual(result.quest.locationAddress, self.place['formattedAddress'])
        self.assertEqual(result.destination.placeId, 'test-depot')
        self.assertTrue(result.destinationVerified)

    def test_multi_quest_selects_and_verifies_ordered_unique_stops(self):
        second = {
            **self.place,
            'id': 'test-park-two',
            'displayName': {'text': 'Second test park'},
            'formattedAddress': '125 Test Street, Gainesville, FL 32601, USA',
            'location': {'latitude': 29.652, 'longitude': -82.324},
        }
        third = {
            **self.place,
            'id': 'test-park-three',
            'displayName': {'text': 'Third test park'},
            'formattedAddress': '130 Test Street, Gainesville, FL 32601, USA',
            'location': {'latitude': 29.653, 'longitude': -82.325},
        }
        self.search.return_value = {'places': [self.place, second, third]}
        preferences = GenerateQuestRequest.model_validate({
            'location': 'Test origin',
            'originCoordinates': {'latitude': 29.651, 'longitude': -82.323},
            'time': {'selection': '60'}, 'budget': {'selection': '0'},
            'preferences': 'Enjoy nature', 'multiQuest': True,
        }).normalize()
        proposal = GeneratedQuestProposal(
            title='Observe three parks', description='Complete one nature observation at each stop.',
            steps=[
                'Observe plants at the first stop.',
                'Compare plants at the second stop.',
                'Record one final observation at the third stop.',
            ],
            estimatedMinutes=30, estimatedCostDollars=0,
            locationName='Provider must override this', locationAddress='Provider must override this',
        )
        with patch.object(generation, 'call_gemini', return_value=proposal) as provider:
            result = generation.generate_preview(preferences, self.selector)
        self.assertEqual(len(result.destinations), 3)
        self.assertEqual(result.destination, result.destinations[0])
        self.assertEqual(len(result.quest.steps), len(result.destinations))
        self.assertTrue(result.destinationVerified)
        self.assertEqual(provider.call_count, 1)
        stops_sent = provider.call_args.args[1]
        self.assertEqual({stop.placeId for stop in stops_sent}, {
            'test-depot', 'test-park-two', 'test-park-three',
        })

    def test_outside_city_candidate_is_filtered_before_random_choice(self):
        outside = {**self.place, 'id': 'outside', 'displayName': {'text': 'Outside park'}, 'location': {'latitude': 28.54, 'longitude': -81.38}}
        self.search.return_value = {'places': [outside, self.place]}
        self.assertEqual(self.selector.select(self.preferences).placeId, 'test-depot')

    def test_distance_is_filtered_before_generation_and_bias_sent_to_google(self):
        self.preferences = GenerateQuestRequest.model_validate({
            'location': 'Test origin', 'originCoordinates': {'latitude': 29.6514, 'longitude': -82.3234},
            'distance': {'maxDistance': 0.1, 'unit': 'miles'},
            'time': {'selection': '60'}, 'budget': {'selection': '0'},
        }).normalize()
        far = {**self.place, 'id': 'far', 'displayName': {'text': 'Far park'}, 'location': {'latitude': 29.6463, 'longitude': -82.347}}
        self.search.return_value = {'places': [far, self.place]}
        selected = self.selector.select(self.preferences)
        self.assertEqual(selected.placeId, 'test-depot')
        self.assertIn('circle', self.search.call_args.args[3])
        self.search.return_value = {'places': [far]}
        with patch.object(generation, 'call_gemini') as provider:
            with self.assertRaises(HTTPException) as caught:
                generation.generate_preview(self.preferences, self.selector)
            self.assertEqual(caught.exception.status_code, 409)
            provider.assert_not_called()

    def test_empty_outside_and_ambiguous_candidates_do_not_call_gemini(self):
        outside = {**self.place, 'location': {'latitude': 0, 'longitude': 0}}
        for places in [[], [outside], [self.place, {**self.place, 'id': 'duplicate-address'}]]:
            self.search.return_value = {'places': places}
            with self.subTest(places=places), patch.object(generation, 'call_gemini') as provider:
                with self.assertRaises(HTTPException) as caught:
                    generation.generate_preview(self.preferences, self.selector)
                self.assertEqual(caught.exception.status_code, 409)
                provider.assert_not_called()

    def test_duplicate_ids_are_deduplicated_but_conflicts_fail(self):
        self.search.return_value = {'places': [self.place, copy.deepcopy(self.place)]}
        self.assertEqual(self.selector.select(self.preferences).placeId, 'test-depot')
        self.search.return_value = {'places': [self.place, {**self.place, 'formattedAddress': 'Conflicting'}]}
        with self.assertRaises(resolver.DestinationResolutionError) as caught:
            self.selector.select(self.preferences)
        self.assertTrue(caught.exception.unavailable)

    def test_paginated_discovery_can_sample_valid_first_page(self):
        self.search.return_value = {'places': [self.place], 'nextPageToken': 'another-page'}
        self.assertEqual(self.selector.select(self.preferences).placeId, 'test-depot')
        # A specific proposed-place lookup still cannot claim unique results.
        with self.assertRaises(resolver.DestinationResolutionError):
            resolver._select_match(self.search.return_value, 'Test park', self.place['formattedAddress'])

    def test_missing_configuration_and_provider_failure_skip_gemini(self):
        for key in ['GOOGLE_PLACES_API_KEY', 'GAINESVILLE_BOUNDARY_PATH']:
            with patch.dict(os.environ, {key: ''}), patch.object(generation, 'call_gemini') as provider:
                with self.assertRaises(HTTPException) as caught:
                    generation.generate_preview(self.preferences, self.selector)
                self.assertEqual(caught.exception.status_code, 503)
                provider.assert_not_called()
        self.search.side_effect = resolver.DestinationResolutionError(unavailable=True)
        with patch.object(generation, 'call_gemini') as provider:
            with self.assertRaises(HTTPException) as caught:
                generation.generate_preview(self.preferences, self.selector)
            self.assertEqual(caught.exception.status_code, 503)
            provider.assert_not_called()
