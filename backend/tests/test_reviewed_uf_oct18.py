import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from backend.scripts.import_reviewed_uf_oct18 import reviewed_events, SESSIONS, SOURCE_URL

NOW = datetime(2026, 10, 18, 8, tzinfo=timezone.utc)
DESTINATION = SimpleNamespace(locationName='Phillips Center', latitude=29.635258, longitude=-82.369306)


def feed(extra='', missing=False):
    events = []
    for identity, (start, end) in SESSIONS.items():
        if missing:
            continue
        stamp = lambda value: datetime.fromisoformat(value).strftime('%Y%m%dT%H%M%SZ')
        events.append(f'BEGIN:VEVENT\r\nUID:{identity}@calendar.ufl.edu\r\nX-LIVEWHALE-ID:{identity}\r\n'
            f'SUMMARY:Davin Youngs - THE RESET\r\nDTSTART:{stamp(start)}\r\nDTEND:{stamp(end)}\r\n'
            f'URL:{SOURCE_URL}\r\n{extra}\r\nEND:VEVENT')
    return ('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+'\r\n'.join(events)+'\r\nEND:VCALENDAR\r\n').encode()


class ReviewedImportTests(unittest.TestCase):
    def test_separate_sessions_use_existing_event_contract(self):
        first = reviewed_events(feed(), DESTINATION, NOW)
        self.assertEqual(set(first), set(reviewed_events(feed(), DESTINATION, NOW)))
        self.assertEqual(len(first), 1)
        self.assertEqual({e.startsAt.hour for e in first.values()}, {15})
        for event in first.values():
            self.assertEqual(event.xpReward, 25)
            self.assertEqual(event.verificationMode, 'gps')
            self.assertEqual(event.sourceUrl, SOURCE_URL)
            self.assertEqual(event.latitude, DESTINATION.latitude)

    def test_changed_source_missing_sessions_and_virtual_events_fail_closed(self):
        for data in [feed(missing=True), feed().replace(b'T150000Z', b'T160000Z'),
                     feed(extra='STATUS:CANCELLED'), feed(extra='X-LIVEWHALE-ONLINE-TYPE:Hybrid'),
                     feed(extra='DESCRIPTION:Virtual performance via Zoom')]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                reviewed_events(data, DESTINATION, NOW)
