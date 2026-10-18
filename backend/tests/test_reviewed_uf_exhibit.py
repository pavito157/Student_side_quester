import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace
from backend.scripts.import_reviewed_uf_exhibit import reviewed_exhibit, KEY, TITLE, SOURCE_URL

NOW = datetime(2026, 10, 18, 9, tzinfo=timezone.utc)
VENUE = SimpleNamespace(locationName='Marston Science Library', latitude=29.6480587, longitude=-82.3437462)


def feed(extra=''):
    return ('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:58454@calendar.ufl.edu\r\n'
        'X-LIVEWHALE-ID:58454\r\nDTSTART;VALUE=DATE:20261018\r\nDTEND;VALUE=DATE:20261019\r\n'
        f'SUMMARY:{TITLE}\r\nURL:{SOURCE_URL}\r\nLOCATION:Marston Science Library 2nd Floor\r\n'
        + extra + '\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n').encode()


class ExhibitTests(unittest.TestCase):
    def test_one_identity_and_reviewed_eastern_hours(self):
        event = reviewed_exhibit(feed(), VENUE, date(2026, 10, 18), NOW)
        self.assertEqual(event.id, KEY)
        self.assertEqual(event.startsAt.hour, 10)
        self.assertEqual(event.endsAt.hour, 18)
        self.assertEqual(event.startsAt.utcoffset().total_seconds(), -4*3600)
        self.assertEqual(event.xpReward, 25)
        self.assertEqual(event.verificationMode, 'gps')
        self.assertEqual(event.latitude, VENUE.latitude)
        self.assertEqual(reviewed_exhibit(feed(), VENUE, date(2026, 10, 18), NOW).id, event.id)

    def test_unreviewed_hours_or_ineligible_source_never_publish(self):
        for data, day in [(feed(), date(2026,10,19)), (feed('STATUS:CANCELLED'), date(2026,10,18)),
                          (feed('X-LIVEWHALE-ONLINE-TYPE:hybrid'), date(2026,10,18)),
                          (feed().replace(b'Marston Science Library 2nd Floor',b'Jacksonville'), date(2026,10,18))]:
            with self.subTest(day=day), self.assertRaises(ValueError):
                reviewed_exhibit(data, VENUE, day, NOW)

    def test_generated_tasks_reject_invisible_control_characters(self):
        from backend.event_quests import EventInstructions
        with self.assertRaises(ValueError):
            EventInstructions(description='Visit the exhibit at Marston.', steps=['Arrive at the venue.', 'Check in.\x00']).checked()
