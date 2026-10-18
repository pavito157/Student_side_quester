"""One-time reviewed Oct 18 import; no scheduler or changes to automatic filters.

Official feed supplies identity and times; UFPA supplies physical venue and facts.
Run without --apply to validate and preview. --apply generates shared Gemini tasks
and writes only the selected GlobalQuests document using the existing sync path.
"""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import re
from pathlib import Path

from dotenv import load_dotenv
from icalendar import Calendar

from backend.auth.firebase_helpers import get_db
from backend.event_quests import generate_instructions
from backend.global_quests import EVENTS, GlobalEvent, default_policy
from backend.quests.destination_resolver import resolve_destination
from backend.uf_calendar import SOURCE, fetch_feed, plain, sync, truthy

SOURCE_URL = 'https://performingarts.ufl.edu/events/davin-youngs-the-reset/'
VENUE = 'Curtis M. Phillips Center for the Performing Arts'
ADDRESS = '3201 Hull Rd, Gainesville, FL 32611, USA'
# Reviewed against UFPA's official listing and the UF calendar feed.
SESSIONS = {
    '55854': ('2026-10-18T15:00:00+00:00', '2026-10-18T16:30:00+00:00'),
}
DESCRIPTION = (
    'Davin Youngs presents THE RESET, a live sound-bath performance combining music '
    'and meditation at the Phillips Center. Attend the scheduled session and check '
    'in at the venue. This is a ticketed event: UF student tickets are listed at $15, '
    'audience seating at $30, and on-stage seating at $40. Admission is not included '
    'with this quest. See the official event page for tickets and details: ' + SOURCE_URL
)


def reviewed_events(data, destination, now):
    matches = {}
    for item in Calendar.from_ical(data).walk('VEVENT'):
        source_id = str(item.get('X-LIVEWHALE-ID', ''))
        if source_id not in SESSIONS:
            continue
        if source_id in matches:
            raise ValueError('Duplicate reviewed source event')
        expected = tuple(datetime.fromisoformat(value) for value in SESSIONS[source_id])
        actual = (item.decoded('DTSTART'), item.decoded('DTEND'))
        if (plain(item.get('SUMMARY')) != 'Davin Youngs - THE RESET'
                or str(item.get('URL')) != SOURCE_URL or actual != expected
                or str(item.get('STATUS', '')).upper() == 'CANCELLED'):
            raise ValueError('Reviewed event facts changed; review official source again')
        # A curated import must not bypass new virtual/hybrid metadata either.
        if any(truthy(item.get(field)) for field in (
            'X-LIVEWHALE-IS-ONLINE', 'X-LIVEWHALE-ONLINE-TYPE', 'X-LIVEWHALE-ONLINE-URL')) or re.search(
                r'\b(online|virtual|hybrid|zoom|webinar|webex|teams)\b',
                plain(item.get('LOCATION')) + ' ' + plain(item.get('DESCRIPTION')), re.I):
            raise ValueError('Reviewed event is online or hybrid')
        key = SOURCE + '-' + sha256((source_id + '|').encode()).hexdigest()[:40]
        matches[source_id] = GlobalEvent(**default_policy().model_dump(), id=key,
            organizationId=SOURCE, organizationName='UF Calendar',
            title=plain(item.get('SUMMARY')), description=DESCRIPTION,
            locationName=destination.locationName, latitude=destination.latitude,
            longitude=destination.longitude, startsAt=actual[0], endsAt=actual[1],
            createdBy='system:uf-calendar', createdAt=now, source=SOURCE,
            sourceUrl=SOURCE_URL)
    if set(matches) != set(SESSIONS):
        raise ValueError('Reviewed source sessions missing; no events imported')
    return {event.id: event for event in matches.values()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', type=Path, help='Save public event JSON and shared tasks')
    args = parser.parse_args()
    load_dotenv('.env')
    now = datetime.now(timezone.utc)
    destination = resolve_destination(VENUE, ADDRESS)  # Includes Gainesville polygon check.
    events = reviewed_events(fetch_feed(), destination, now)
    result = {'mode': 'apply' if args.apply else 'dry-run', 'events': []}
    if args.apply:
        db = get_db()
        for key, event in events.items():
            if event.endsAt <= now:
                raise ValueError('Reviewed session has ended; no stale events may be published')
            previous = db.collection(EVENTS).document(key).get()
            cached = GlobalEvent.model_validate(previous.to_dict()).questTemplate if previous.exists else None
            event.questTemplate = cached or generate_instructions(event)
        result['writes'] = sync(db, events, set(), now, {'eligible': len(events), 'reviewed': True})
    for event in events.values():
        result['events'].append(event.model_dump(mode='json'))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
