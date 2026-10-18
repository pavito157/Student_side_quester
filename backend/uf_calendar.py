"""Conservative, idempotent UF calendar import. Run through the operator CLI."""
from collections import Counter
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
import re
from urllib.request import Request, urlopen
from urllib.parse import urlparse

from firebase_admin import firestore
from icalendar import Calendar
import recurring_ical_events

from backend.global_quests import EVENTS, GlobalEvent, default_policy
from backend.quests.destination_resolver import _inside_boundary, _load_boundary

FEED_URL = "https://calendar.ufl.edu/live/ical/events"
SOURCE = "uf-calendar"
MAX_BYTES = 8 * 1024 * 1024


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(unescape(str(value or "")))
    return " ".join(" ".join(parser.parts).split())


def fetch_feed():
    with urlopen(Request(FEED_URL, headers={"User-Agent": "Sidequester-UF-Calendar/1.0"}), timeout=30) as response:
        # Do not silently import a redirect to a different source.
        if urlparse(response.url).hostname != "calendar.ufl.edu":
            raise ValueError("Unexpected calendar source")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("Calendar exceeds import size limit")
    return data


def truthy(value):
    return str(value or "").strip().lower() not in ("", "0", "false", "no")


def prepare(data, now, polygons, days=14):
    """Return accepted events, rejected occurrence IDs, and reason counts; no writes."""
    if not 1 <= days <= 31:
        raise ValueError("Import horizon must be 1–31 days")
    if len(data) > MAX_BYTES or b"BEGIN:VCALENDAR" not in data or b"END:VCALENDAR" not in data:
        raise ValueError("Invalid or incomplete calendar feed")
    calendar = Calendar.from_ical(data)
    originals = calendar.walk("VEVENT")
    if not originals or len(originals) > 10000:
        raise ValueError("Unexpected calendar event count")
    recurring = {str(e.get('UID')) for e in originals if e.get('RRULE') or e.get('RECURRENCE-ID')}
    # Reject sub-daily recurrence frequencies before expansion to bound work.
    for event in originals:
        rule = event.get('RRULE')
        if rule and any(str(f) not in ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY') for f in rule.get('FREQ', [])):
            raise ValueError("Unsupported recurrence frequency")
    occurrences = recurring_ical_events.of(calendar).between(now - timedelta(days=7), now + timedelta(days=days))
    if len(occurrences) > 20000:
        raise ValueError("Too many calendar occurrences")
    accepted, rejected, counts = {}, set(), Counter()
    policy = default_policy().model_dump()
    for event in occurrences:
        uid = str(event.get('X-LIVEWHALE-ID') or event.get('UID') or '')
        if not uid:
            counts['missing_identity'] += 1; continue
        recurrence = event.get('RECURRENCE-ID')
        suffix = str(recurrence.dt) if str(event.get('UID')) in recurring and recurrence else ''
        key = SOURCE + '-' + sha256((uid + '|' + suffix).encode()).hexdigest()[:40]
        try:
            start, end = event.decoded('DTSTART'), event.decoded('DTEND')
            if not isinstance(start, datetime) or not isinstance(end, datetime) or start.tzinfo is None or end.tzinfo is None:
                raise ValueError('untimed_or_all_day')
            if end <= now or start >= now + timedelta(days=days):
                counts['outside_window'] += 1; continue
            if str(event.get('STATUS', '')).upper() == 'CANCELLED' or truthy(event.get('X-LIVEWHALE-CANCELED')):
                raise ValueError('cancelled')
            location = plain(event.get('LOCATION'))
            online_metadata = any(truthy(event.get(field)) for field in (
                'X-LIVEWHALE-IS-ONLINE', 'X-LIVEWHALE-ONLINE-TYPE', 'X-LIVEWHALE-ONLINE-URL'))
            if online_metadata or re.search(r'\b(online|virtual|hybrid|zoom|webinar|webex|teams)\b|https?://', location, re.I):
                raise ValueError('online_or_hybrid')
            geo = event.get('GEO')
            if geo is None:
                raise ValueError('missing_coordinates')
            lat, lon = float(geo.latitude), float(geo.longitude)
            if not _inside_boundary(polygons, lat, lon):
                raise ValueError('outside_gainesville')
            source_url = str(event.get('URL') or '')
            parsed = urlparse(source_url)
            if parsed.scheme != 'https' or parsed.hostname != 'calendar.ufl.edu' or parsed.username or parsed.password:
                raise ValueError('invalid_source_link')
            description = plain(event.get('DESCRIPTION'))[:3000]
            if len(description) < 10:
                description = 'Attend this UF calendar event at the listed venue during its scheduled time.'
            accepted[key] = GlobalEvent(**policy, id=key, organizationId=SOURCE,
                organizationName='UF Calendar', title=plain(event.get('SUMMARY'))[:160],
                description=description, locationName=location[:300], latitude=lat, longitude=lon,
                startsAt=start, endsAt=end, createdBy='system:uf-calendar', createdAt=now,
                source=SOURCE, sourceUrl=source_url)
            counts['eligible'] += 1
        except (ValueError, TypeError, KeyError, AttributeError) as error:
            reason = str(error)
            counts[reason if reason in ('untimed_or_all_day', 'cancelled', 'online_or_hybrid',
                'missing_coordinates', 'outside_gainesville', 'invalid_source_link') else 'invalid_event'] += 1
            rejected.add(key)
    if accepted.keys() & rejected:
        raise ValueError('Conflicting duplicate source occurrences; no import performed')
    return accepted, rejected, dict(counts)


def sync(db, accepted, rejected, now, counts):
    """Each occurrence is atomic; retries preserve reward policy and private claims."""
    outcomes = Counter()
    for key in sorted(set(accepted) | rejected):
        ref = db.collection(EVENTS).document(key)
        @firestore.transactional
        def write(transaction):
            previous = ref.get(transaction=transaction)
            old = previous.to_dict() if previous.exists else None
            if old and old.get('source') != SOURCE:
                raise ValueError('Import ID collides with a non-imported event')
            if key not in accepted:
                if old:
                    transaction.update(ref, {'status': 'cancelled'})
                    return 'cancelled'
                return 'skipped'
            event = accepted[key]
            if old:
                prior = GlobalEvent.model_validate(old)
                event = event.model_copy(update={field: getattr(prior, field) for field in (
                    'createdAt', 'xpReward', 'radiusMeters', 'maxAccuracyMeters', 'verificationMode', 'graceMinutes', 'questTemplate')})
            transaction.set(ref, event.model_dump())
            return 'updated' if old else 'created'
        outcomes[write(db.transaction())] += 1
    # Protected by existing Organizations rules. Never stores credentials or attendee GPS.
    db.collection('Organizations').document('_uf_calendar_import').collection('sync').document('latest').set({
        'lastSuccessfulAt': now, 'counts': counts, 'outcomes': dict(outcomes), 'sourceUrl': FEED_URL})
    return dict(outcomes)


def run(db=None, apply=False, days=14):
    now = datetime.now(timezone.utc)
    accepted, rejected, counts = prepare(fetch_feed(), now, _load_boundary(), days)
    result = {'mode': 'apply' if apply else 'dry-run', 'counts': counts,
              'eligibleEvents': len(accepted), 'horizonDays': days}
    if apply:
        result['writes'] = sync(db, accepted, rejected, now, counts)
    return result
