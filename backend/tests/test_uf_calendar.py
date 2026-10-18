import os
import unittest
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from fastapi import HTTPException
from backend import uf_calendar as u
from backend import global_quests as g

NOW = datetime(2026, 10, 18, 4, tzinfo=timezone.utc)
POLYGONS = [[[[-82.5,29.5],[-82.2,29.5],[-82.2,29.8],[-82.5,29.8],[-82.5,29.5]]]]


def feed(extra='', start='DTSTART:20261018T180000Z', end='DTEND:20261018T190000Z', geo='GEO:29.65;-82.34', location='Reitz Union'):
    return ('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:stable@calendar.ufl.edu\r\n'
        'X-LIVEWHALE-ID:12345\r\nSUMMARY:Campus meeting\r\nDESCRIPTION:Meet students at this campus event.\r\n'
        'URL:https://calendar.ufl.edu/event/12345\r\nLOCATION:' + location + '\r\n' + start + '\r\n' + end + '\r\n' + geo + '\r\n'
        + extra + '\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n').encode()


class CalendarTests(unittest.TestCase):
    def prepare(self, data):
        return u.prepare(data, NOW, POLYGONS)

    def test_eligible_gps_event_and_deterministic_identity(self):
        first, rejected, counts = self.prepare(feed())
        self.assertEqual(len(first), 1)
        self.assertFalse(rejected)
        event = next(iter(first.values()))
        self.assertEqual(event.xpReward, 25)
        self.assertEqual(event.verificationMode, 'gps')
        self.assertEqual(event.source, 'uf-calendar')
        moved, _, _ = self.prepare(feed(start='DTSTART:20261019T180000Z', end='DTEND:20261019T190000Z'))
        self.assertEqual(set(first), set(moved))

    def test_filters_fail_closed(self):
        for data, reason in [
            (feed(extra='X-LIVEWHALE-IS-ONLINE:1'), 'online_or_hybrid'),
            (feed(extra='X-LIVEWHALE-ONLINE-TYPE:Hybrid'), 'online_or_hybrid'),
            (feed(location='Zoom meeting'), 'online_or_hybrid'),
            (feed(geo='GEO:30.4;-84.2'), 'outside_gainesville'),
            (feed(geo=''), 'missing_coordinates'),
            (feed(start='DTSTART;VALUE=DATE:20261018',end='DTEND;VALUE=DATE:20261019'), 'untimed_or_all_day'),
            (feed(end=''), 'invalid_event'),
            (feed(extra='X-LIVEWHALE-CANCELED:1'), 'cancelled'),
            (feed(extra='STATUS:CANCELLED'), 'cancelled')]:
            accepted, _, counts = self.prepare(data)
            self.assertFalse(accepted, reason)
            self.assertGreater(counts.get(reason, 0), 0, (reason, counts))

    def test_recurrences_have_distinct_ids_and_exdates(self):
        accepted, _, _ = self.prepare(feed(extra='RRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20261019T180000Z'))
        self.assertEqual(len(accepted), 2)
        self.assertEqual(len(set(accepted)), 2)

    def test_local_time_and_dst(self):
        accepted, _, _ = u.prepare(feed(start='DTSTART;TZID=America/New_York:20261101T100000',
            end='DTEND;TZID=America/New_York:20261101T110000'), datetime(2026,11,1,tzinfo=timezone.utc), POLYGONS)
        event = next(iter(accepted.values()))
        self.assertEqual(event.startsAt.astimezone(timezone.utc).hour, 15)

    def test_bad_source_is_not_a_successful_empty_import(self):
        for data in (b'<html>unavailable</html>', b'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR',
                     feed(extra='RRULE:FREQ=SECONDLY;COUNT=1000000')):
            with self.assertRaises(ValueError): self.prepare(data)

    def test_description_is_plain_text(self):
        self.assertEqual(u.plain('<p>Hello &amp; welcome</p>'), 'Hello & welcome')

    def test_fetch_failure_never_writes(self):
        with patch.object(u, 'fetch_feed', side_effect=OSError('offline')), patch.object(u, 'sync') as write:
            with self.assertRaises(OSError): u.run(apply=True)
            write.assert_not_called()


@unittest.skipUnless(os.environ.get('FIRESTORE_EMULATOR_HOST'), 'Local emulator required')
class ImportEmulatorTests(unittest.TestCase):
    def test_upsert_cancel_and_claim_policy_preservation(self):
        self.assertIn(os.environ['FIRESTORE_EMULATOR_HOST'].split(':')[0], ('127.0.0.1','localhost'))
        db = Client(project='demo-sidequest-tests', credentials=AnonymousCredentials())
        self.addCleanup(db.close)
        events, _, counts = u.prepare(feed(), NOW, POLYGONS)
        event = next(iter(events.values())).model_copy(update={'id': 'uf-test-' + uuid.uuid4().hex})
        events = {event.id: event}
        ref = db.collection(g.EVENTS).document(event.id)
        self.addCleanup(ref.delete)
        state = db.collection('Organizations').document('_uf_calendar_import').collection('sync').document('latest')
        prior = state.get()
        self.addCleanup(lambda: state.set(prior.to_dict()) if prior.exists else state.delete())
        self.assertEqual(u.sync(db, events, set(), NOW, counts)['created'], 1)
        template = {'description':'Attend this public campus event at its scheduled time.', 'steps':['Arrive at the listed venue.', 'Attend the event and check in.']}
        ref.update({'xpReward': 35, 'questTemplate': template})
        self.assertEqual(u.sync(db, events, set(), NOW, counts)['updated'], 1)
        self.assertEqual(ref.get().to_dict()['xpReward'], 35)
        self.assertEqual(ref.get().to_dict()['questTemplate'], template)
        self.assertEqual(u.sync(db, {}, {event.id}, NOW, counts)['cancelled'], 1)
        self.assertEqual(ref.get().to_dict()['status'], 'cancelled')
        with self.assertRaises(HTTPException) as error:
            g.check_in(db, 'nobody', event.id, g.CheckIn())
        self.assertEqual(error.exception.status_code, 409)
        self.assertIn('no longer', error.exception.detail)
        u.sync(db, events, set(), NOW, counts)
        self.assertEqual(ref.get().to_dict()['status'], 'published')
        # Source import never touches manual events, balances, or claims.
        ref.update({'source': None})
        with self.assertRaises(ValueError): u.sync(db, events, set(), NOW, counts)
