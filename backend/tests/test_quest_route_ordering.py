import itertools
from collections import defaultdict
import unittest
from unittest.mock import MagicMock, patch

from backend.quests.destination_resolver import VerifiedDestinationSelector
from backend.quests.quest_contracts import Coordinates, GenerateQuestRequest, GeneratedQuestProposal, RouteDependency, SelectedDestination, StepProofEvidence
from backend.quests.quest_generation import generate_preview
from backend.quest_route_ordering import geographic_order, order_new_quest
from backend.quests.quest_validation import calculate_distance
from backend.quests import quest_completion
from backend.auth.firebase_helpers import USERS


class RouteOrderingTests(unittest.TestCase):
    def setUp(self):
        # Synthetic coordinates near NW 13th Street: the old route passes the
        # near stop to go east, then backtracks. These are not real venue claims.
        self.origin = Coordinates(latitude=29.66, longitude=-82.339)
        self.stops = [SelectedDestination(
            locationName=name, locationAddress=f'{name} test address',
            latitude=29.66, longitude=longitude, placeId=name, scope='gainesville_city',
        ) for name, longitude in [('East', -82.31), ('Near', -82.335), ('Far east', -82.30)]]
        self.proposal = GeneratedQuestProposal(
            title='A connected experience', description='Create and compare a personal collection.',
            steps=['East photo', 'East recreation', 'Near photo', 'Far location'],
            stepProofMethods=['photo', 'recreation', 'photo', 'location'],
            stepDestinationIndexes=[0, 0, 1, 2], routeCandidateIndexes=[0, 1, 2],
            locationName='East', locationAddress='East test address',
            estimatedMinutes=20, estimatedCostDollars=0,
        )

    def distance(self, order):
        points = [self.origin, *[self.stops[index] for index in order]]
        return sum(calculate_distance(a.latitude, a.longitude, b.latitude, b.longitude)
                   for a, b in zip(points, points[1:]))

    def test_nw_13th_street_backtracking_and_atomic_proof_mapping(self):
        ordered, stops = order_new_quest(self.proposal, self.stops, self.origin)
        self.assertEqual([stop.locationName for stop in stops], ['Near', 'East', 'Far east'])
        self.assertLess(self.distance([1, 0, 2]), self.distance([0, 1, 2]))
        self.assertEqual(ordered.steps, ['Near photo', 'East photo', 'East recreation', 'Far location'])
        self.assertEqual(ordered.stepProofMethods, ['photo', 'photo', 'recreation', 'location'])
        self.assertEqual(ordered.stepDestinationIndexes, [0, 1, 1, 2])
        self.assertEqual(ordered.locationName, 'Near')
        self.assertEqual(ordered.locationAddress, 'Near test address')
        self.assertEqual(self.proposal.steps[0], 'East photo')  # No input mutation.
        self.assertNotIn('routeDependencies', ordered.model_dump())

    def test_distance_minimum_matches_exhaustive_reference(self):
        order = geographic_order(self.stops, self.origin)
        self.assertAlmostEqual(self.distance(order), min(self.distance(p) for p in itertools.permutations(range(3))))

    def test_proof_evidence_follows_actions_through_reordering_and_stays_private(self):
        proposal = self.proposal.model_copy(update={'stepEvidence': [
            StepProofEvidence(expectedPhotoEvidence=f'artifact-{index}',
                              proofObligations=['visible_result']) for index in range(4)]})
        ordered, _ = order_new_quest(proposal, self.stops, self.origin)
        self.assertEqual([item.expectedPhotoEvidence for item in ordered.stepEvidence],
                         ['artifact-2', 'artifact-0', 'artifact-1', 'artifact-3'])
        self.assertEqual(ordered.stepDestinationIndexes, [0, 1, 1, 2])
        self.assertNotIn('stepEvidence', ordered.model_dump())

    def test_genuine_activity_dependency_overrides_shorter_unconstrained_order(self):
        dependency = RouteDependency(before=0, after=1, reason='The comparison at Near requires the image created at East')
        order = geographic_order(self.stops, self.origin, [dependency])
        self.assertLess(order.index(0), order.index(1))
        valid = [p for p in itertools.permutations(range(3)) if p.index(0) < p.index(1)]
        self.assertAlmostEqual(self.distance(order), min(self.distance(p) for p in valid))

    def test_invalid_or_contradictory_dependencies_are_rejected(self):
        for before, after in [(0, 0), (2, 1), (0, 3)]:
            with self.subTest(before=before, after=after), self.assertRaises(ValueError):
                geographic_order(self.stops, self.origin, [RouteDependency(before=before, after=after, reason='Invalid')])

    def test_no_origin_preserves_order_and_single_destination_is_unchanged(self):
        self.assertEqual(geographic_order(self.stops, None), [0, 1, 2])
        self.assertEqual(geographic_order(self.stops[:1], self.origin), [0])

    def test_ten_stops_keep_maximum_support_without_forcing_extra_stops(self):
        stops = [self.stops[0].model_copy(update={'longitude': -82.33 + index * 0.001}) for index in range(10)]
        order = geographic_order(stops, self.origin)
        self.assertEqual(sorted(order), list(range(10)))
        self.assertEqual(geographic_order(stops[:2], self.origin), [0, 1])

    def test_full_new_generation_remaps_before_response_and_preserves_constraints(self):
        preferences = GenerateQuestRequest.model_validate({
            'location': 'NW 13th Street test origin', 'originCoordinates': self.origin.model_dump(),
            'time': {'selection': '30'}, 'budget': {'selection': '0'}, 'multiQuest': True,
            'activeVibe': {'name': 'Music Minded', 'preferences': 'A substantive creative experience'},
        }).normalize()
        with patch.object(VerifiedDestinationSelector, 'select_candidates', return_value=self.stops), \
                patch('backend.quests.quest_generation.call_gemini', return_value=self.proposal):
            result = generate_preview(preferences, VerifiedDestinationSelector())
        self.assertEqual(result.destination.placeId, 'Near')
        self.assertEqual([stop.placeId for stop in result.destinations], ['Near', 'East', 'Far east'])
        self.assertEqual(result.quest.stepDestinationIndexes, [0, 1, 1, 2])
        self.assertIn('straight-line', result.message)
        self.assertEqual(result.normalizedPreferences.vibe.name, 'Music Minded')
        self.assertNotIn('routeDependencies', result.quest.model_dump())

    def test_completion_criterion_moves_to_final_action_without_changing_its_text(self):
        proposal = self.proposal.model_copy(update={
            'completionCriteria': 'your collection is complete',
            'steps': [*self.proposal.steps[:-1], self.proposal.steps[-1] + " You're done when your collection is complete"],
        })
        origin = Coordinates(latitude=29.66, longitude=-82.299)
        ordered, _ = order_new_quest(proposal, self.stops, origin)
        self.assertTrue(ordered.steps[-1].endswith("You're done when your collection is complete"))
        self.assertEqual(sum('You\'re done when' in step for step in ordered.steps), 1)

    def test_reordered_photo_proof_progress_and_xp_use_new_step_indexes(self):
        proposal, stops = order_new_quest(self.proposal, self.stops, self.origin)
        collections = defaultdict(MagicMock)
        db = MagicMock()
        db.collection.side_effect = lambda name: collections[name]
        user = collections[USERS].document.return_value
        nested = user.collection.return_value.document.return_value
        quest = {
            **proposal.model_dump(), 'userId': 'student', 'ownerId': 'student',
            'questId': 'quest', 'status': 'assigned', 'isActive': True,
            'destinations': [stop.model_dump(exclude={'locationAddress', 'rating', 'priceLevel', 'userRatingCount', 'discoveryProfiles'}) for stop in stops],
            'verifiedPhotoSteps': [], 'skippedPhotoSteps': [], 'completedStops': [],
            'xpReward': 15, 'radiusMeters': 50,
        }
        nested.get.return_value.exists = True
        nested.get.return_value.to_dict.side_effect = lambda: quest
        user.get.return_value.exists = True
        user.get.return_value.to_dict.return_value = {'xp': 0, 'dormId': 'dorm'}
        dorm = collections['dorms'].document.return_value
        dorm.get.return_value.exists = True
        dorm.get.return_value.to_dict.return_value = {'xp': 0}
        transaction = db.transaction.return_value
        with patch.object(quest_completion.firestore, 'transactional', side_effect=lambda callback: callback):
            with self.assertRaises(quest_completion.CompletionError) as caught:
                quest_completion.complete_quest(db, 'student', 'quest', None, None, None)
            self.assertIn('photo proof', str(caught.exception))
            transaction.update.assert_not_called()
            quest['verifiedPhotoSteps'] = [0]  # Near's photo moved from step 2 to step 0.
            first = quest_completion.complete_quest(db, 'student', 'quest', None, None, None)
            self.assertEqual(first['completedStops'], [0])
            self.assertEqual(first['xpAwarded'], 5)
            quest['completedStops'] = [0]
            quest['verifiedPhotoSteps'] = [0, 1]  # East's photo is now step 1.
            second = quest_completion.complete_quest(db, 'student', 'quest', None, None, None, stop_index=1)
            self.assertEqual(second['completedStops'], [0, 1])
            self.assertEqual(second['xpAwardedSoFar'], 10)
            self.assertEqual(second['xpAwarded'], 5)  # Recreation adds no extra award.

    def test_location_only_stop_keeps_configured_xp(self):
        proposal, stops = order_new_quest(self.proposal, self.stops, self.origin)
        collections = defaultdict(MagicMock)
        db = MagicMock()
        db.collection.side_effect = lambda name: collections[name]
        user = collections[USERS].document.return_value
        nested = user.collection.return_value.document.return_value
        quest = {
            **proposal.model_dump(), 'userId': 'student', 'ownerId': 'student',
            'questId': 'quest', 'status': 'assigned', 'isActive': True,
            'destinations': [
                stop.model_dump(exclude={
                    'locationAddress', 'rating', 'priceLevel', 'userRatingCount', 'discoveryProfiles',
                })
                for stop in stops
            ],
            'stepProofMethods': ['location'] * len(proposal.steps),
            'verifiedPhotoSteps': [], 'skippedPhotoSteps': [], 'completedStops': [],
            'xpReward': 15, 'radiusMeters': 50,
        }
        nested.get.return_value.exists = True
        nested.get.return_value.to_dict.return_value = quest
        user.get.return_value.exists = True
        user.get.return_value.to_dict.return_value = {'xp': 0, 'dormId': 'dorm'}
        dorm = collections['dorms'].document.return_value
        dorm.get.return_value.exists = True
        dorm.get.return_value.to_dict.return_value = {'xp': 0}

        with patch.object(quest_completion.firestore, 'transactional', side_effect=lambda callback: callback):
            result = quest_completion.complete_quest(
                db, 'student', 'quest', stops[0].latitude, stops[0].longitude, 10,
            )

        self.assertEqual(result['status'], 'in_progress')
        self.assertEqual(result['xpAwarded'], 5)
        self.assertEqual(result['xpAwardedSoFar'], 5)

    def test_single_location_only_quest_keeps_configured_xp(self):
        collections = defaultdict(MagicMock)
        db = MagicMock()
        db.collection.side_effect = lambda name: collections[name]
        user = collections[USERS].document.return_value
        nested = user.collection.return_value.document.return_value
        destination = self.stops[0].model_dump(exclude={
            'locationAddress', 'rating', 'priceLevel', 'userRatingCount', 'discoveryProfiles',
        })
        quest = {
            'userId': 'student', 'ownerId': 'student', 'questId': 'quest',
            'status': 'assigned', 'isActive': True, 'steps': ['Visit the destination.'],
            'destinations': [destination], 'stepProofMethods': ['location'],
            'stepDestinationIndexes': [0], 'verifiedPhotoSteps': [],
            'skippedPhotoSteps': [], 'completedStops': [], 'xpReward': 15,
            'radiusMeters': 50,
        }
        nested.get.return_value.exists = True
        nested.get.return_value.to_dict.return_value = quest
        user.get.return_value.exists = True
        user.get.return_value.to_dict.return_value = {'xp': 0, 'dormId': 'dorm'}
        dorm = collections['dorms'].document.return_value
        dorm.get.return_value.exists = True
        dorm.get.return_value.to_dict.return_value = {'xp': 0}

        with patch.object(quest_completion.firestore, 'transactional', side_effect=lambda callback: callback):
            result = quest_completion.complete_quest(
                db, 'student', 'quest', self.stops[0].latitude, self.stops[0].longitude, 10,
            )

        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['xpAwarded'], 15)
        self.assertEqual(result['xpAwardedSoFar'], 15)


if __name__ == '__main__':
    unittest.main()
