import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import Mock, patch

from fastapi import HTTPException
from backend import event_quests as e
from backend import global_quests as g
from backend.quests.quest_completion import complete_quest, abandon_quest, CompletionError
from backend.tests import test_global_quests as fixtures
NOW = fixtures.NOW

INSTRUCTIONS = e.EventInstructions(description='Attend the campus meeting at the announced venue.',
    steps=['Arrive at the listed venue during the scheduled event.', 'Attend the meeting and check in at the venue.'])


class EventGenerationTests(unittest.TestCase):
    def test_generation_sends_only_event_facts_and_rejects_bad_json(self):
        event = Mock(title='Meeting', description='Club meeting.', locationName='Campus venue', startsAt=NOW, endsAt=NOW)
        response = Mock(status_code=200)
        response.json.return_value = {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':INSTRUCTIONS.model_dump_json()}]}}]}
        client = Mock(); client.post.return_value = response
        with patch.dict(os.environ, {'GEMINI_API_KEY':'test-key','GEMINI_MODEL':'gemini-test'}), patch.object(e,'get_gemini_http_client',return_value=client):
            self.assertEqual(e.generate_instructions(event), INSTRUCTIONS)
            body = client.post.call_args.kwargs['json']
            self.assertEqual(body['generationConfig']['temperature'], 0.1)
            self.assertNotIn('userId', str(body))
            response.json.return_value = {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{"xpReward":999}'}]}}]}
            with self.assertRaises(HTTPException) as error: e.generate_instructions(event)
            self.assertEqual(error.exception.status_code,502)


@unittest.skipUnless(os.environ.get('FIRESTORE_EMULATOR_HOST'), 'Local emulator required')
class EventAcceptanceTests(unittest.TestCase):
    setUp = fixtures.GlobalQuestEmulatorTests.setUp

    def accept(self, uid=None):
        result = e.accept_event(self.db, uid or self.uid, self.event.id)
        self.addCleanup(self.db.collection('Users').document(uid or self.uid).collection('sidequests').document(result.quest.id).delete)
        return result

    def test_shared_template_idempotent_accept_and_personal_completion(self):
        other = self.uid + '-other'
        user_ref = self.db.collection('Users').document(other)
        user_ref.set({'xp':0,'dormId':self.dorm}); self.addCleanup(user_ref.delete)
        with patch.object(e,'generate_instructions',return_value=INSTRUCTIONS) as generate:
            first = self.accept()
            second = self.accept(other)
            duplicate = self.accept()
        self.assertEqual(generate.call_count,1)
        self.assertEqual(first.quest.steps,second.quest.steps)
        self.assertEqual(first.quest.id,duplicate.quest.id)
        self.assertTrue(duplicate.reusedExisting)
        self.assertEqual(first.quest.xpReward,25)
        self.assertEqual(self.user_ref.get().to_dict()['xp'],10)
        result = complete_quest(self.db,self.uid,first.quest.id,29.65,-82.34,5)
        self.assertEqual(result['xpAwarded'],0)
        self.assertEqual(self.dorm_ref.get().to_dict()['xp'],125)
        self.assertFalse(self.user_ref.collection('sidequests').document(first.quest.id).get().exists)
        with self.assertRaises(HTTPException): g.check_in(self.db,self.uid,self.event.id,g.CheckIn(latitude=29.65,longitude=-82.34,accuracy=5))
        with self.assertRaises(HTTPException): self.accept()

    def test_abandon_then_reaccept_and_full_slot_protection(self):
        with patch.object(e,'generate_instructions',return_value=INSTRUCTIONS):
            saved = self.accept()
            abandon_quest(self.db,self.uid,saved.quest.id)
            saved = self.accept()
            raw = self.user_ref.collection('sidequests').document(saved.quest.id).get().to_dict()
            for i in range(2):
                qid = 'normal-' + str(i)
                ref = self.user_ref.collection('sidequests').document(qid)
                ref.set({**raw,'questId':qid,'sourceGlobalEventId':None})
                self.addCleanup(ref.delete)
            # Already accepted remains viewable with all three slots occupied.
            self.assertTrue(self.accept().reusedExisting)
            with self.assertRaises(HTTPException) as error:
                e.accept_event(self.db,self.uid,'different-event')
            self.assertEqual(error.exception.status_code,429)
        self.assertEqual(self.user_ref.get().to_dict()['xp'],10)

    def test_current_event_time_gps_and_cancellation_control_personal_completion(self):
        with patch.object(e,'generate_instructions',return_value=INSTRUCTIONS): saved = self.accept()
        for changes, lat in [({'startsAt': NOW.replace(year=2027), 'endsAt': NOW.replace(year=2027, hour=20)},29.65),
                             ({'startsAt':self.event.startsAt,'endsAt':self.event.endsAt},30.0),
                             ({'status':'cancelled'},29.65)]:
            self.event_ref.update(changes)
            with self.assertRaises(CompletionError): complete_quest(self.db,self.uid,saved.quest.id,lat,-82.34,5)
        self.assertEqual(self.user_ref.get().to_dict()['xp'],10)
        self.assertFalse(self.claim_ref.get().exists)

    def test_board_and_detail_race_awards_once_and_frees_slot(self):
        with patch.object(e,'generate_instructions',return_value=INSTRUCTIONS): saved = self.accept()
        def run(detail):
            try:
                if detail: return complete_quest(self.db,self.uid,saved.quest.id,29.65,-82.34,5)
                return g.check_in(self.db,self.uid,self.event.id,g.CheckIn(latitude=29.65,longitude=-82.34,accuracy=5))
            except (HTTPException,CompletionError): return None
        with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(run,[True,False]))
        self.assertEqual(len([r for r in results if r]),1)
        self.assertEqual(self.user_ref.get().to_dict()['xp'],35)
        self.assertEqual(self.dorm_ref.get().to_dict()['xp'],125)
        self.assertFalse(self.user_ref.collection('sidequests').document(saved.quest.id).get().exists)

    def test_failed_generation_does_not_consume_a_slot(self):
        with patch.object(e,'generate_instructions',side_effect=HTTPException(503,'Unavailable')):
            with self.assertRaises(HTTPException): self.accept()
        self.assertEqual(len(list(self.user_ref.collection('sidequests').stream())),0)
        self.assertIsNone(self.event_ref.get().to_dict().get('questTemplate'))


    def test_concurrent_first_acceptors_share_one_canonical_template(self):
        other = self.uid + '-concurrent'
        other_ref = self.db.collection('Users').document(other)
        other_ref.set({'xp':0, 'dormId':self.dorm}); self.addCleanup(other_ref.delete)
        gate = Barrier(2)
        variants = iter([INSTRUCTIONS, INSTRUCTIONS.model_copy(update={'description':'Attend the advertised campus event at the listed venue.'})])
        def generate(event):
            value = next(variants)
            gate.wait(timeout=10)
            return value
        with patch.object(e,'generate_instructions',side_effect=generate):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda uid: e.accept_event(self.db,uid,self.event.id), [self.uid,other]))
        for result in results:
            self.addCleanup(self.db.collection('Users').document(result.assignment.userId).collection('sidequests').document(result.quest.id).delete)
        self.assertEqual(results[0].quest.description, results[1].quest.description)
        self.assertEqual(results[0].quest.steps, results[1].quest.steps)

    def test_cancellation_during_generation_does_not_save_assignment(self):
        def generate(event):
            self.event_ref.update({'status':'cancelled'})
            return INSTRUCTIONS
        with patch.object(e,'generate_instructions',side_effect=generate):
            with self.assertRaises(HTTPException) as error: self.accept()
        self.assertEqual(error.exception.status_code,409)
        self.assertEqual(len(list(self.user_ref.collection('sidequests').stream())),0)


    def test_legacy_partial_cache_is_rebuilt_without_breaking_event_lists(self):
        self.event_ref.update({'questTemplate':{'steps':['Old partial cache']}})
        self.assertTrue(any(event['id'] == self.event.id for event in g.list_events(self.uid,self.db)['quests']))
        with patch.object(e,'generate_instructions',return_value=INSTRUCTIONS) as generate:
            result = self.accept()
        self.assertEqual(generate.call_count,1)
        self.assertEqual(result.quest.steps,INSTRUCTIONS.steps)
        self.assertEqual(self.event_ref.get().to_dict()['questTemplate'],INSTRUCTIONS.model_dump())
