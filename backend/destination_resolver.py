"""Resolve places conservatively; see docs/destination_resolver.md for setup."""

import json
import math
import os
import re
import random
import unicodedata
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.quest_contracts import ResolvedDestination
from backend.quest_generation import DestinationResolutionError


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


def _search(name, address, key, location_bias=None):
    body = {"textQuery": f"{name}, {address}", "languageCode": "en", "pageSize": 20}
    if location_bias is not None:
        body["locationBias"] = location_bias
    request = Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                 "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,nextPageToken"},
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
        from backend.quest_contracts import SelectedDestination
        from backend.quest_validation import calculate_distance

        polygons = _load_boundary()
        key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
        if not key:
            raise DestinationResolutionError(unavailable=True)
        text = " ".join([preferences.preferences, *preferences.goals,
                         preferences.vibe.preferences if preferences.vibe else ""]).lower()
        # Category hints choose live search results, not predefined quests/venues.
        category = "public parks"
        if re.search(r"\b(read|reading|books|library|study|studying)\b", text):
            category = "public libraries"
        elif preferences.budget.maxDollars != 0:
            for words, query in [(r"\b(art|gallery|galleries)\b", "art galleries"),
                                 (r"\b(museum|history)\b", "museums"),
                                 (r"\b(coffee|cafe|cafes)\b", "cafes"),
                                 (r"\b(food|restaurant|restaurants)\b", "restaurants")]:
                if re.search(words, text):
                    category = query
                    break
        origin = getattr(preferences.location, "coordinates", None)
        bias = None
        if origin is not None:
            radius = min(50000, preferences.maxDistanceMiles * 1609.344) if preferences.maxDistanceMiles else 5000
            bias = {"circle": {"center": {"latitude": origin.latitude, "longitude": origin.longitude},
                               "radius": radius}}
        places, _token = _validated_places(_search(category, "Gainesville, Florida", key, bias))
        # Discovery samples one page; it does not claim an exhaustive city search.
        groups = {}
        for place in places:
            identity = (_normalized(place["displayName"]["text"]), _normalized_address(place["formattedAddress"]))
            groups.setdefault(identity, []).append(place)
        eligible = []
        for group in groups.values():
            if len(group) != 1:  # Same name/address with multiple IDs is ambiguous.
                continue
            place = group[0]
            lat, lon = place["location"]["latitude"], place["location"]["longitude"]
            if not _inside_boundary(polygons, lat, lon):
                continue
            if preferences.maxDistanceMiles is not None:
                if origin is None:
                    raise NoEligibleDestination()
                if calculate_distance(origin.latitude, origin.longitude, lat, lon) > preferences.maxDistanceMiles * 1609.344:
                    continue
            eligible.append(place)
        if not eligible:
            raise NoEligibleDestination()
        if origin is not None:
            eligible.sort(key=lambda place: calculate_distance(
                origin.latitude, origin.longitude,
                place["location"]["latitude"], place["location"]["longitude"],
            ))
        return [
            SelectedDestination(
                locationName=place["displayName"]["text"], locationAddress=place["formattedAddress"],
                latitude=place["location"]["latitude"], longitude=place["location"]["longitude"],
                placeId=place["id"], scope="gainesville_city",
            )
            for place in eligible
        ]

    def select(self, preferences):
        return random.choice(self._eligible_places(preferences))

    def select_stops(self, preferences):
        """Select two or three unique, verified places; route nearest-first."""
        places = self._eligible_places(preferences)
        if len(places) < 2:
            raise NoEligibleDestination()
        if getattr(preferences.location, "coordinates", None) is None:
            random.shuffle(places)
        return places[:3]
