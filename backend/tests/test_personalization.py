"""Offline personalization routing tests; provider relevance is a controlled fixture."""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.destination_resolver import VerifiedDestinationSelector
from backend.personalization import personalization_context
from backend.quest_contracts import GenerateQuestRequest, SelectedDestination


class PersonalizationTests(unittest.TestCase):
    def request(self, **changes):
        return GenerateQuestRequest.model_validate({
            'location': 'Anywhere', 'time': {'selection': '30'},
            'budget': {'selection': '0'}, **changes,
        })

    def test_conditional_hierarchy_and_legacy_compatibility(self):
        vibe = {'name': 'Study Break', 'preferences': 'Affordable games to burn nervous energy'}
        cases = [
            ({'activeVibe': vibe, 'preferences': 'Quiet reading', 'goals': ['Study']}, 'active_vibe'),
            ({'activeVibe': vibe}, 'active_vibe'),
            ({'activeVibe': None, 'vibePreferences': 'Inactive old vibe', 'preferences': 'Art'}, 'preferences'),
            ({'preferences': 'Art', 'goals': ['Exercise']}, 'preferences'),
            ({'goals': ['Make friends']}, 'goals'),
            ({}, 'surprise'),
            ({'vibePreferences': 'Legacy selected description'}, 'active_vibe'),
        ]
        for data, expected in cases:
            with self.subTest(data=data):
                normalized = self.request(**data).normalize()
                context = personalization_context(normalized)
                self.assertEqual(context['mode'], expected)
                self.assertNotIn('Inactive old vibe', context['primaryExperience'])
        normalized = self.request(activeVibe=vibe).normalize()
        self.assertEqual(normalized.vibe.name, 'Study Break')
        self.assertEqual(personalization_context(normalized)['primary']['description'], vibe['preferences'])

    def test_distinct_vibes_guide_discovery_not_conflicting_profile_or_popularity(self):
        env = {
            'GOOGLE_PLACES_API_KEY': 'test-only',
            'GAINESVILLE_BOUNDARY_PATH': str(Path(__file__).resolve().parents[1] / 'data/gainesville-boundary.geojson'),
        }
        queries = []
        def search(query, *args):
            queries.append(query)
            # Fake provider distinguishes experiences, not a claim about live Places quality.
            relevant = 'recreation' if 'Study Break' in query else 'gallery'
            place_id = relevant if query.startswith('Activity venues') else 'popular-park'
            return {'places': [{
                'id': place_id, 'displayName': {'text': place_id},
                'formattedAddress': place_id + ', Gainesville, FL',
                'location': {'latitude': 29.6514, 'longitude': -82.3234},
                'rating': 5.0, 'userRatingCount': 10000 if place_id == 'popular-park' else 5,
            }]}
        with patch.dict(os.environ, env), patch('backend.destination_resolver._search', side_effect=search):
            selector = VerifiedDestinationSelector()
            for name, description, expected in [
                ('Study Break', 'I like low cost activities I can do to burn off nervous energy.', 'recreation'),
                ('Art Night', 'Enjoy creative visual art', 'gallery'),
            ]:
                queries.clear()
                preferences = self.request(activeVibe={'name': name, 'preferences': description},
                                           preferences='Quiet reading ' * 200, goals=['Study']).normalize()
                self.assertEqual(selector.select(preferences).placeId, expected)
                self.assertEqual(len(queries), 4)
                for query in queries:
                    self.assertIn(name, query)
                    self.assertIn(description, query)
                    self.assertNotIn('Quiet reading', query)

    def test_full_primary_text_survives_and_inactive_vibe_is_absent(self):
        description = 'An affordable energizing break. ' * 30 + 'Prefer casual games, no walking circuits.'
        context = personalization_context(self.request(
            activeVibe={'name': 'Study Break', 'preferences': description}, preferences='Books ' * 500,
        ).normalize())
        self.assertTrue(context['primaryExperience'].endswith('no walking circuits.'))
        self.assertGreater(len(context['primaryExperience']), 180)
        general = personalization_context(self.request(
            activeVibe=None, vibePreferences=description, preferences='Creative photography',
        ).normalize())
        self.assertEqual(general['primaryExperience'], 'Creative photography')

    def test_candidate_pool_keeps_relevance_majority_and_diversity(self):
        places = [SelectedDestination(
            locationName=f'{profile} {index}', locationAddress='Test address',
            latitude=29.65, longitude=-82.32, placeId=f'{profile}-{index}', scope='gainesville_city',
            discoveryProfiles=[profile], rating=4.0, userRatingCount=10,
        ) for profile in ['popular', 'niche', 'user', 'surprise'] for index in range(20)]
        selected = VerifiedDestinationSelector._mixed_candidate_pool(places)
        self.assertGreater(sum('user' in place.discoveryProfiles for place in selected), len(selected) / 2)
        self.assertEqual({place.discoveryProfiles[0] for place in selected}, {'user', 'popular', 'niche', 'surprise'})
        self.assertEqual(len({place.placeId for place in selected}), len(selected))

    def test_vibe_does_not_replace_normalized_hard_constraints(self):
        request = self.request(activeVibe={'name': 'Big spender', 'preferences': 'Travel far and spend all day'},
                               location='Test origin', originCoordinates={'latitude': 29.65, 'longitude': -82.32},
                               distance={'maxDistance': 1, 'unit': 'miles'}, proofOptions=['photo'], multiQuest=True)
        normalized = request.normalize()
        self.assertEqual(normalized.budget.maxDollars, 0)
        self.assertEqual(normalized.time.maxMinutes, 30)
        self.assertEqual(normalized.maxDistanceMiles, 1)
        self.assertEqual(normalized.proofOptions, ['photo'])
        self.assertTrue(normalized.multiQuest)


if __name__ == '__main__':
    unittest.main()
