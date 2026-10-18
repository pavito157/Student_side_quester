"""Restored single-call pipeline and retained deterministic proof protections."""
import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend.quests import quest_generation as generation
from backend.quests.destination_resolver import VerifiedDestinationSelector
from backend.quests.quest_contracts import GenerateQuestRequest, SelectedDestination, StepProofEvidence
from backend.tests import test_quest_generation as fixtures


class GenerationRollbackTests(unittest.TestCase):
    def test_multi_stop_uses_one_http_call_and_reorders_proof_and_steps(self):
        fixture = fixtures.GenerationTests()
        fixture.setUp()
        try:
            fixture.proposal.pop('locationName')
            fixture.proposal.pop('locationAddress')
            draft = {**fixture.provider_draft(), 'routeCandidateIndexes': [0, 1],
                     'stepDestinationIndexes': [0, 1]}
            fixture.http(body={'candidates': [{'finishReason': 'STOP', 'content': {
                'parts': [{'text': json.dumps(draft)}]}}]})
            preferences = GenerateQuestRequest.model_validate({
                **fixture.body, 'multiQuest': True, 'location': 'NW 13th Street test origin',
                'originCoordinates': {'latitude': 29.66, 'longitude': -82.339},
            }).normalize()
            east = SelectedDestination(locationName='East', locationAddress='East test address',
                                       latitude=29.66, longitude=-82.31, placeId='east', scope='gainesville_city')
            near = east.model_copy(update={'locationName': 'Near', 'placeId': 'near', 'longitude': -82.335})
            with (patch.object(VerifiedDestinationSelector, 'select_candidates', return_value=[east, near]),
                  patch.object(VerifiedDestinationSelector, 'select', side_effect=AssertionError('Multi-stop'))):
                result = generation.generate_preview(preferences, VerifiedDestinationSelector())
            self.assertEqual(len(fixture.requests), 1)
            self.assertEqual([stop.placeId for stop in result.destinations], ['near', 'east'])
            self.assertEqual(result.quest.stepProofMethods, ['photo', 'location'])
            self.assertEqual(result.quest.stepDestinationIndexes, [0, 1])
            self.assertTrue(result.quest.steps[0].startswith('Sketch a pattern.'))
            self.assertEqual(result.quest.stepEvidence[0].proofObligations, ['visible_result'])
        finally:
            fixture.doCleanups()

    def test_verified_generation_uses_one_http_call_in_each_personalization_mode(self):
        for changes, mode in [
            ({'activeVibe': {'name': 'Gym Bod', 'preferences': 'Fun athletic activity'}}, 'active_vibe'),
            ({'activeVibe': None}, 'preferences'),
            ({'activeVibe': None, 'preferences': ''}, 'goals'),
            ({'activeVibe': None, 'preferences': '', 'goals': []}, 'surprise'),
        ]:
            with self.subTest(mode=mode):
                fixture = fixtures.GenerationTests()
                fixture.setUp()
                try:
                    fixture.proposal.pop('locationName')
                    fixture.proposal.pop('locationAddress')
                    fixture.http()
                    preferences = GenerateQuestRequest.model_validate({**fixture.body, **changes}).normalize()
                    place = SelectedDestination(**fixture.destination.model_dump(), locationAddress='Verified address')
                    with (patch.object(VerifiedDestinationSelector, 'select', return_value=place),
                          patch.object(VerifiedDestinationSelector, 'select_candidates', side_effect=AssertionError('Single stop'))):
                        result = generation.generate_preview(preferences, VerifiedDestinationSelector())
                    self.assertTrue(result.destinationVerified)
                    self.assertEqual(len(fixture.requests), 1)
                    body = json.loads(fixture.requests[0].content)
                    context = json.loads(body['contents'][0]['parts'][0]['text'])
                    self.assertEqual(context['personalization']['mode'], mode)
                    self.assertNotIn('experiencePlan', context)
                    self.assertNotIn('activityEvidence', context)
                    self.assertFalse(hasattr(generation, 'plan_experience'))
                    self.assertFalse(hasattr(generation, 'review_fulfillment'))
                    self.assertNotIn('stepEvidence', result.quest.model_dump())
                finally:
                    fixture.doCleanups()

    def test_proof_obligations_cannot_be_overridden_by_location_or_photo(self):
        for method in ('location', 'photo'):
            with self.subTest(method=method), self.assertRaises(HTTPException) as caught:
                generation.validate_step_evidence(['Complete a workout'], [method], [
                    StepProofEvidence(proofObligations=['action_completion'], expectedPhotoEvidence='A workout selfie'),
                ], [method])
            self.assertEqual(caught.exception.status_code, 502)
            self.assertEqual(caught.exception.detail['code'], 'proof_incompatible')

    def test_recreation_keeps_action_steps_without_changing_proof_methods(self):
        generation.validate_step_evidence(['Enjoy independent exercise'], ['recreation'], [
            StepProofEvidence(proofObligations=['action_completion']),
        ], ['recreation'])

    def test_missing_evidence_or_photo_description_fails_closed(self):
        for evidence, status in [([], 502), ([StepProofEvidence(proofObligations=['visible_result'])], 502)]:
            with self.subTest(status=status), self.assertRaises(HTTPException) as caught:
                generation.validate_step_evidence(['Create a drawing'], ['photo'], evidence, ['photo'])
            self.assertEqual(caught.exception.status_code, status)
