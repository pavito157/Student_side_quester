"""Resolve places conservatively; see docs/destination_resolver.md for setup."""

import json
import math
import os
import re
import random
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.quests.quest_contracts import (
    MAX_DESTINATION_CANDIDATES, ResolvedDestination, SelectedDestination,
)
from backend.personalization import personalization_context
from backend.quests.quest_generation import DestinationResolutionError


def _normalized(value):
    return " ".join(re.findall(r"\w+", unicodedata.normalize("NFKC", value).casefold()))


def _normalized_address(value):
    """Ignore only an optional trailing US country label, not address content.

    Gemini often omits ', USA' while Places includes it. Require a comma-delimited
    country suffix so this cannot remove a street/city word or foreign country.
    City containment is independently checked using the provider's coordinates.
    """
    parts = value.rsplit(",", 1)
    if len(parts) == 2 and _normalized(parts[1]) in (
        "usa", "us", "u s a", "u s", "united states", "united states of america",
    ):
        value = parts[0]
    return _normalized(value)


def _number(value, limit):
    return (isinstance(value, (float, int)) and not isinstance(value, bool)
            and abs(value) <= limit and math.isfinite(value))


def _text(value):
    return isinstance(value, str) and bool(_normalized(value))


def _ring_contains(ring, x, y):
    """Ray casting in GeoJSON longitude/latitude order; edges are excluded."""
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
        if abs(cross) < 1e-12 and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            return None
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def _load_boundary():
    """Accept only a deployment-reviewed WGS84 Gainesville GeoJSON Feature."""
    try:
        feature = json.loads(Path(os.environ["GAINESVILLE_BOUNDARY_PATH"]).read_text(encoding="utf-8"))
        properties = feature["properties"]
        if (feature["type"] != "Feature" or "crs" in feature
                or properties["scope"] != "gainesville_city"
                or not all(isinstance(properties[k], str) and properties[k].strip()
                           for k in ("source_url", "reviewed_by", "reviewed_on"))):
            raise ValueError("Missing boundary provenance")
        date.fromisoformat(properties["reviewed_on"])
        geometry = feature["geometry"]
        if geometry["type"] == "Polygon":
            polygons = [geometry["coordinates"]]
        elif geometry["type"] == "MultiPolygon":
            polygons = geometry["coordinates"]
        else:
            raise ValueError("Expected polygons")
        if not polygons:
            raise ValueError("Empty boundary")
        for polygon in polygons:
            if not isinstance(polygon, list) or not polygon:
                raise ValueError("Empty polygon")
            for ring in polygon:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError("Unclosed ring")
                for point in ring:
                    if not isinstance(point, list) or len(point) != 2 or not _number(point[0], 180) or not _number(point[1], 90):
                        raise ValueError("Invalid coordinate")
                if len({tuple(p) for p in ring}) < 3:
                    raise ValueError("Degenerate ring")
                area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
                if abs(area) < 1e-12 or any(a == b for a, b in zip(ring, ring[1:])):
                    raise ValueError("Degenerate ring")
        return polygons
    except (OSError, KeyError, ValueError, TypeError, IndexError, OverflowError):
        raise DestinationResolutionError(unavailable=True) from None


def _concise_query(text, limit=200):
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0]


def _search(name, address, key, location_bias=None):
    body = {"textQuery": f"{name}, {address}", "languageCode": "en", "pageSize": 20}
    if location_bias is not None:
        body["locationBias"] = location_bias
    request = Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                 "X-Goog-FieldMask": (
                     "places.id,places.displayName,places.formattedAddress,places.location,"
                     "places.rating,places.userRatingCount,places.priceLevel,nextPageToken"
                 )},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            result = json.load(response)
        if not isinstance(result, dict) or "error" in result:
            raise ValueError("Invalid provider response")
        return result
    except (HTTPError, URLError, OSError, ValueError):
        # Includes quota/authentication failures: the provider cannot be used.
        # Do not expose response bodies or credentials in exceptions.
        raise DestinationResolutionError(unavailable=True) from None


def _validated_places(result):
    """Validate and deduplicate every returned provider record before selection."""
    try:
        if not isinstance(result, dict) or "error" in result:
            raise ValueError("Invalid response")
        token = result.get("nextPageToken", "")
        places = result.get("places", [])
        if not isinstance(token, str) or not isinstance(places, list):
            raise ValueError("Invalid pagination/results")
        seen = {}
        for place in places:
            name, address = place["displayName"]["text"], place["formattedAddress"]
            place_id = place["id"]
            lat, lon = place["location"]["latitude"], place["location"]["longitude"]
            if not all(_text(v) for v in (name, address, place_id)):
                raise ValueError("Invalid place")
            if not _number(lat, 90) or not _number(lon, 180):
                raise ValueError("Invalid coordinates")
            rating = place.get("rating")
            rating_count = place.get("userRatingCount")
            price_level = place.get("priceLevel")
            if (rating is not None and (not _number(rating, 5) or rating < 0)
                    or rating_count is not None and (
                        type(rating_count) is not int or rating_count < 0
                    )
                    or price_level is not None and price_level not in {
                        "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE",
                        "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE",
                        "PRICE_LEVEL_VERY_EXPENSIVE",
                    }):
                raise ValueError("Invalid place quality metadata")
            if place_id in seen and seen[place_id] != place:
                raise ValueError("Conflicting provider results")
            seen[place_id] = place
        return list(seen.values()), token
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        raise DestinationResolutionError(unavailable=True) from None


def _select_match(result, location_name, location_address):
    """Direct-name lookup: require a unique complete-page normalized match."""
    places, token = _validated_places(result)
    matches = [p for p in places
               if _normalized(p["displayName"]["text"]) == _normalized(location_name)
               and _normalized_address(p["formattedAddress"]) == _normalized_address(location_address)]
    if token or len(matches) != 1:
        raise DestinationResolutionError()
    return matches[0]


def _inside_boundary(polygons, lat, lon):
    return any(_ring_contains(p[0], lon, lat) is True
               and all(_ring_contains(hole, lon, lat) is False for hole in p[1:])
               for p in polygons)


def resolve_destination(
    location_name: str,
    location_address: str,
) -> ResolvedDestination:
    """Require one normalized match and independently check city-limit geometry.

    Only an optional trailing US country label is ignored in addresses. Aliases
    and street abbreviations are not inferred. No caller/Gemini GPS is accepted.
    """
    if not all(_text(v) for v in (location_name, location_address)):
        raise DestinationResolutionError()
    polygons = _load_boundary()
    key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    if not key:
        raise DestinationResolutionError(unavailable=True)
    place = _select_match(_search(location_name, location_address, key), location_name, location_address)
    lat, lon = place["location"]["latitude"], place["location"]["longitude"]
    if not _inside_boundary(polygons, lat, lon):
        raise DestinationResolutionError()
    return ResolvedDestination(
        locationName=place["displayName"]["text"], latitude=lat, longitude=lon,
        placeId=place["id"], scope="gainesville_city",
    )


class NoEligibleDestination(DestinationResolutionError):
    """The bounded live search returned no unambiguous city/distance candidates."""


class VerifiedDestinationSelector:
    """Discover a place first; never ask Gemini to invent its address or GPS."""

    def __call__(self, location_name, location_address):
        return resolve_destination(location_name, location_address)

    def _eligible_places(self, preferences):
        needed = 2 if preferences.multiQuest else 1
        try:
            places = self._discover(preferences)
            if len(places) >= needed:
                return places
        except NoEligibleDestination:
            pass
        # Overly specific interests can match too little; retry with a broad search.
        places = self._discover(preferences, "things to do")
        if len(places) < needed:
            raise NoEligibleDestination()
        return places

    def _discover(self, preferences, query_override=None):
        from backend.quests.quest_validation import calculate_distance

        polygons = _load_boundary()
        key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
        if not key:
            raise DestinationResolutionError(unavailable=True)
        # Keep the full primary experience; supporting profile text cannot crowd
        # it out or steer the search toward an incompatible interest.
        plan = personalization_context(preferences)
        # Long profile text makes Places return nothing; search with a concise excerpt.
        user_query = query_override or _concise_query(plan["primaryExperience"])
        origin = getattr(preferences.location, "coordinates", None)
        bias = None
        if origin is not None:
            radius = min(50000, preferences.maxDistanceMiles * 1609.344) if preferences.maxDistanceMiles else 5000
            bias = {"circle": {"center": {"latitude": origin.latitude, "longitude": origin.longitude},
                               "radius": radius}}
        searches = [
            ("user", f"Activity venues matching this intended experience: {user_query}"),
            ("popular", f"Well-liked places for this intended experience: {user_query}"),
            ("niche", f"Independent and lesser-known places for this intended experience: {user_query}"),
            ("surprise", f"Creative recreation venues compatible with this intended experience: {user_query}"),
        ]
        # Independent bounded queries broaden discovery without sending profile
        # details or coordinates to Gemini; Google receives only search text and
        # an optional server-side location bias.
        with ThreadPoolExecutor(max_workers=len(searches)) as executor:
            results = list(executor.map(
                lambda item: _search(item[1], "Gainesville, Florida", key, bias),
                searches,
            ))

        places_by_id = {}
        profiles_by_id = {}
        user_rank_by_id = {}
        for (profile, _), result in zip(searches, results):
            places, _ = _validated_places(result)
            for rank, place in enumerate(places):
                place_id = place["id"]
                if profile == "user":
                    user_rank_by_id.setdefault(place_id, rank)
                existing = places_by_id.get(place_id)
                if existing and (
                    existing["displayName"]["text"] != place["displayName"]["text"]
                    or existing["formattedAddress"] != place["formattedAddress"]
                    or existing["location"] != place["location"]
                ):
                    raise DestinationResolutionError(unavailable=True)
                if existing is None:
                    places_by_id[place_id] = place
                else:
                    for field in ("rating", "userRatingCount", "priceLevel"):
                        if field not in existing and field in place:
                            existing[field] = place[field]
                profiles_by_id.setdefault(place_id, set()).add(profile)

        # Discovery samples one page per profile and does not claim exhaustive coverage.
        groups = {}
        for place in places_by_id.values():
            identity = (_normalized(place["displayName"]["text"]), _normalized_address(place["formattedAddress"]))
            groups.setdefault(identity, []).append(place)
        eligible, outside_distance = [], []
        min_needed = 2 if preferences.multiQuest else 1
        for group in groups.values():
            if len(group) != 1:  # Same name/address with multiple IDs is ambiguous.
                continue
            place = group[0]
            lat, lon = place["location"]["latitude"], place["location"]["longitude"]
            if not _inside_boundary(polygons, lat, lon):
                continue
            too_far = (
                preferences.maxDistanceMiles is not None and origin is not None
                and calculate_distance(origin.latitude, origin.longitude, lat, lon)
                > preferences.maxDistanceMiles * 1609.344
            )
            (outside_distance if too_far else eligible).append(SelectedDestination(
                locationName=place["displayName"]["text"], locationAddress=place["formattedAddress"],
                latitude=lat, longitude=lon, placeId=place["id"], scope="gainesville_city",
                rating=place.get("rating"), userRatingCount=place.get("userRatingCount"),
                priceLevel=place.get("priceLevel"),
                discoveryProfiles=sorted(profiles_by_id.get(place["id"], set())),
            ))
        if len(eligible) < min_needed and outside_distance:
            # Prefer the closest city places over failing when the distance limit is too tight.
            outside_distance.sort(key=lambda place: calculate_distance(
                origin.latitude, origin.longitude, place.latitude, place.longitude))
            eligible.extend(outside_distance[:max(min_needed - len(eligible), 3)])
        if not eligible:
            raise NoEligibleDestination()
        eligible.sort(key=lambda place: (
            user_rank_by_id.get(place.placeId, float("inf")),
            calculate_distance(origin.latitude, origin.longitude, place.latitude, place.longitude)
            if origin is not None else 0,
        ))
        return self._mixed_candidate_pool(eligible)

    @staticmethod
    def _mixed_candidate_pool(places):
        def popularity(place):
            return place.userRatingCount or 0

        popular = sorted(
            [place for place in places if "popular" in place.discoveryProfiles],
            key=lambda place: (popularity(place), place.rating or 0), reverse=True,
        )
        niche = sorted(
            [place for place in places if "niche" in place.discoveryProfiles],
            key=lambda place: (popularity(place), -(place.rating or 0)),
        )
        user = [place for place in places if "user" in place.discoveryProfiles]
        surprise = sorted(
            [place for place in places if "surprise" in place.discoveryProfiles],
            key=lambda place: (place.rating or 0, popularity(place)), reverse=True,
        )
        pools = {"popular": popular, "niche": niche, "user": user, "surprise": surprise}
        priority = ["user", "user", "user", "popular", "user", "niche", "surprise"]
        mixed, seen = [], set()
        while len(mixed) < MAX_DESTINATION_CANDIDATES and any(pools.values()):
            progressed = False
            for profile in priority:
                pool = pools[profile]
                while pool and pool[0].placeId in seen:
                    pool.pop(0)
                if pool:
                    place = pool.pop(0)
                    mixed.append(place)
                    seen.add(place.placeId)
                    progressed = True
                    if len(mixed) >= MAX_DESTINATION_CANDIDATES:
                        break
            if not progressed:
                remaining = next((pool for pool in pools.values() if pool), [])
                if not remaining:
                    break
                place = remaining.pop(0)
                if place.placeId not in seen:
                    mixed.append(place)
                    seen.add(place.placeId)
        if not mixed:
            return places[:MAX_DESTINATION_CANDIDATES]
        return mixed

    def select(self, preferences):
        places = self._eligible_places(preferences)
        # Provider relevance defines the shortlist; popular places remain eligible
        # when returned for this experience, rather than overriding it.
        relevant = [place for place in places if "user" in place.discoveryProfiles]
        return random.choice(relevant[:5] or places[:5])

    def select_candidates(self, preferences):
        """Return a diverse, verified candidate pool; Gemini plans a route of up to ten."""
        places = self._eligible_places(preferences)
        return places
