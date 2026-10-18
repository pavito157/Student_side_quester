"""Reviewed 4Most exhibit import. Dry run by default; --apply publishes one event."""
import argparse
from datetime import date, datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from icalendar import Calendar

from backend.auth.firebase_helpers import get_db
from backend.event_quests import generate_instructions
from backend.global_quests import EVENTS, GlobalEvent, default_policy
from backend.quests.destination_resolver import resolve_destination
from backend.uf_calendar import SOURCE, fetch_feed, plain, sync, truthy

TITLE = 'An Unreasonable Commitment to the Square'
SOURCE_URL = 'https://calendar.ufl.edu/event/58457-an-unreasonable-commitment-to-the-square'
KEY = SOURCE + '-' + sha256(b'58457|').hexdigest()[:40]
DAY = date(2026, 10, 19)
EASTERN = ZoneInfo('America/New_York')
# Reviewed Google Places hours: closed Sunday; next Monday 12–5 PM.
START = datetime(2026, 10, 19, 12, tzinfo=EASTERN)
END = datetime(2026, 10, 19, 17, tzinfo=EASTERN)
DESCRIPTION = (
    'Visit Kelsey Barton’s free exhibition An Unreasonable Commitment to the Square '
    'at 4Most Gallery & Studio. Explore ceramic works built from repeated square '
    'forms and the relationship between structure, repetition, and clay. The exhibit '
    'runs October 12–23, 2026. The gallery is closed Sunday; this quest’s next '
    'check-in window is Monday, October 19, noon–5 PM Eastern. Earn 25 XP once '
    'per person for the entire exhibit, even if the board is refreshed later.'
)


def reviewed_square(data, destination, now):
    entries = [e for e in Calendar.from_ical(data).walk('VEVENT')
               if str(e.get('X-LIVEWHALE-ID', '')) == '58457' and e.decoded('DTSTART') == DAY]
    if len(entries) != 1:
        raise ValueError('Expected one reviewed October 19 exhibit listing')
    event = entries[0]
    if (plain(event.get('SUMMARY')) != TITLE or str(event.get('URL')) != SOURCE_URL
            or plain(event.get('LOCATION')) != '4Most Gallery & Studio'
            or str(event.get('STATUS', '')).upper() == 'CANCELLED'
            or any(truthy(event.get(field)) for field in ('X-LIVEWHALE-IS-ONLINE',
                 'X-LIVEWHALE-ONLINE-TYPE', 'X-LIVEWHALE-ONLINE-URL'))):
        raise ValueError('Reviewed exhibit facts changed')
    return GlobalEvent(**default_policy().model_dump(), id=KEY, organizationId=SOURCE,
        organizationName='UF Calendar', title=TITLE, description=DESCRIPTION,
        locationName=destination.locationName, latitude=destination.latitude,
        longitude=destination.longitude, startsAt=START, endsAt=END,
        createdBy='system:uf-calendar', createdAt=now, source=SOURCE, sourceUrl=SOURCE_URL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    load_dotenv('.env')
    now = datetime.now(timezone.utc)
    destination = resolve_destination('4Most Gallery', '534 SW 4th Ave, Gainesville, FL 32601, USA')
    event = reviewed_square(fetch_feed(), destination, now)
    result = {'mode': 'apply' if args.apply else 'dry-run'}
    if args.apply:
        if END <= now:
            raise ValueError('Reviewed check-in window has ended')
        db = get_db()
        prior = db.collection(EVENTS).document(KEY).get()
        cached = GlobalEvent.model_validate(prior.to_dict()).questTemplate if prior.exists else None
        event.questTemplate = cached or generate_instructions(event)
        result['writes'] = sync(db, {KEY: event}, set(), now, {'eligible': 1, 'reviewed': True})
        event = GlobalEvent.model_validate(db.collection(EVENTS).document(KEY).get().to_dict())
    result['event'] = event.model_dump(mode='json')
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
