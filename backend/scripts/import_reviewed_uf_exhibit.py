"""Publish today's reviewed Marston exhibit window and retire the later RESET.

Stable source identity preserves one completion across the entire exhibition.
No scheduler is enabled. Future-day refreshes require reviewed opening hours.
"""
import argparse
from datetime import datetime, date, time, timezone
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

SOURCE_ID = '58454'
SOURCE_URL = 'https://calendar.ufl.edu/event/58454-excavating-a-legacy-dr-kathleen-deagan'
TITLE = 'Excavating a Legacy: Dr. Kathleen Deagan'
KEY = SOURCE + '-' + sha256((SOURCE_ID + '|').encode()).hexdigest()[:40]
RETIRED_KEY = SOURCE + '-' + sha256(b'55853|').hexdigest()[:40]
# Explicitly reviewed Sunday hours from the official listing. No inferred holiday hours.
REVIEWED_WINDOWS = {date(2026, 10, 18): (time(10), time(18))}
DESCRIPTION = (
    'Explore the free Excavating a Legacy exhibition on Marston Science Library’s '
    'second floor. Discover Dr. Kathleen Deagan’s archaeology career through '
    'historical artifacts, publications, letters, and oral-history excerpts. '
    'The exhibition runs August 20–December 18, 2026. Today’s quest check-in window '
    'is October 18, 10 AM–6 PM Eastern. One 25 XP completion per person for the '
    'entire exhibition; refreshing the board does not reset eligibility.'
)


def reviewed_exhibit(data, destination, day, now):
    if day not in REVIEWED_WINDOWS:
        raise ValueError('Opening hours have not been reviewed for this day')
    selected = [item for item in Calendar.from_ical(data).walk('VEVENT')
        if str(item.get('X-LIVEWHALE-ID', '')) == SOURCE_ID and item.decoded('DTSTART') == day]
    if len(selected) != 1:
        raise ValueError('Expected exactly one reviewed exhibit listing for this day')
    item = selected[0]
    if (plain(item.get('SUMMARY')) != TITLE or str(item.get('URL')) != SOURCE_URL
            or plain(item.get('LOCATION')) != 'Marston Science Library 2nd Floor'
            or str(item.get('STATUS', '')).upper() == 'CANCELLED'
            or any(truthy(item.get(field)) for field in ('X-LIVEWHALE-IS-ONLINE',
                'X-LIVEWHALE-ONLINE-TYPE', 'X-LIVEWHALE-ONLINE-URL'))):
        raise ValueError('Reviewed exhibit facts changed')
    start, end = REVIEWED_WINDOWS[day]
    eastern = ZoneInfo('America/New_York')
    return GlobalEvent(**default_policy().model_dump(), id=KEY,
        organizationId=SOURCE, organizationName='UF Calendar', title=TITLE,
        description=DESCRIPTION, locationName=destination.locationName + ' - 2nd Floor',
        latitude=destination.latitude, longitude=destination.longitude,
        startsAt=datetime.combine(day, start, eastern), endsAt=datetime.combine(day, end, eastern),
        createdBy='system:uf-calendar', createdAt=now, source=SOURCE, sourceUrl=SOURCE_URL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    load_dotenv('.env')
    now = datetime.now(timezone.utc)
    day = now.astimezone(ZoneInfo('America/New_York')).date()
    # Exact Google venue match and reviewed Gainesville boundary, never Gemini GPS.
    destination = resolve_destination('Marston Science Library', '444 Newell Dr, Gainesville, FL 32611, USA')
    event = reviewed_exhibit(fetch_feed(), destination, day, now)
    result = {'mode': 'apply' if args.apply else 'dry-run', 'retiredEventId': RETIRED_KEY}
    if args.apply:
        if event.endsAt <= now:
            raise ValueError('Today’s check-in window has ended')
        db = get_db()
        prior = db.collection(EVENTS).document(KEY).get()
        cached = GlobalEvent.model_validate(prior.to_dict()).questTemplate if prior.exists else None
        event.questTemplate = cached or generate_instructions(event)
        result['writes'] = sync(db, {KEY: event}, {RETIRED_KEY}, now, {'eligible': 1, 'reviewed': True})
        saved = db.collection(EVENTS).document(KEY).get().to_dict()
        result['event'] = GlobalEvent.model_validate(saved).model_dump(mode='json')
        retired = db.collection(EVENTS).document(RETIRED_KEY).get()
        result['retiredStatus'] = retired.to_dict().get('status') if retired.exists else 'not-present'
    else:
        result['event'] = event.model_dump(mode='json')
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
