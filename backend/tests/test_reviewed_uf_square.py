import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from backend.scripts.import_reviewed_uf_square import reviewed_square, TITLE, SOURCE_URL, KEY

NOW = datetime(2026, 10, 18, 9, tzinfo=timezone.utc)
VENUE = SimpleNamespace(locationName='4Most Gallery', latitude=29.6485125, longitude=-82.3306479)


def feed(extra=''):
    return ('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:58457@calendar.ufl.edu\r\n'
        'X-LIVEWHALE-ID:58457\r\nDTSTART;VALUE=DATE:20261019\r\nDTEND;VALUE=DATE:20261020\r\n'
        f'SUMMARY:{TITLE}\r\nURL:{SOURCE_URL}\r\nLOCATION:4Most Gallery & Studio\r\n'
        + extra + '\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n').encode()


class SquareExhibitTests(unittest.TestCase):
    def test_next_open_window_and_stable_exhibit_identity(self):
        event = reviewed_square(feed(), VENUE, NOW)
        self.assertEqual(event.id, KEY)
        self.assertEqual(event.startsAt.weekday(), 0)
        self.assertEqual((event.startsAt.day, event.startsAt.hour, event.endsAt.hour), (19,12,17))
        self.assertEqual(event.startsAt.utcoffset().total_seconds(), -4*3600)
        self.assertEqual(event.xpReward,25)
        self.assertEqual(event.verificationMode,'gps')
        self.assertEqual(event.latitude,VENUE.latitude)
        self.assertEqual(reviewed_square(feed(), VENUE, NOW).id,KEY)

    def test_cancelled_hybrid_wrong_date_or_venue_are_rejected(self):
        for data in [feed('STATUS:CANCELLED'),feed('X-LIVEWHALE-IS-ONLINE:1'),
                     feed().replace(b'20261019',b'20261018'),
                     feed().replace(b'4Most Gallery & Studio',b'Online')]:
            with self.subTest(data=data),self.assertRaises(ValueError):
                reviewed_square(data, VENUE, NOW)
