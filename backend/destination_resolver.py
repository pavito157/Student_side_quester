"""Resolve places conservatively; see docs/destination_resolver.md for setup."""

import json
import math
import os
import re
import unicodedata
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.quest_contracts import ResolvedDestination
from backend.quest_generation import DestinationResolutionError


def _normalized(value):
    return " ".join(re.findall(r"\w+", unicodedata.normalize("NFKC", value).casefold()))


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
    """Accept only a deployment-reviewed WGS84 GeoJSON Feature."""
    try:
        feature = json.loads(Path(os.environ["UF_CAMPUS_BOUNDARY_PATH"]).read_text(encoding="utf-8"))
        properties = feature["properties"]
        if (feature["type"] != "Feature" or "crs" in feature
                or properties["scope"] != "uf_campus"
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


def _search(name, address, key):
    request = Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps({"textQuery": f"{name}, {address}", "languageCode": "en", "pageSize": 20}).encode(),
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


def _select_match(result, location_name, location_address):
    """Validate all candidates before selecting one; do not use result ranking."""
    try:
        if not isinstance(result, dict) or "error" in result:
            raise ValueError("Invalid response")
        token = result.get("nextPageToken", "")
        if not isinstance(token, str):
            raise ValueError("Invalid pagination")
        places = result.get("places", [])
        if not isinstance(places, list):
            raise ValueError("Invalid results")
        matches = {}
        seen = {}
        for place in places:
            name = place["displayName"]["text"]
            address = place["formattedAddress"]
            place_id = place["id"]
            lat, lon = place["location"]["latitude"], place["location"]["longitude"]
            if not all(_text(v) for v in (name, address, place_id)):
                raise ValueError("Invalid place")
            if not _number(lat, 90) or not _number(lon, 180):
                raise ValueError("Invalid coordinates")
            identity = (name, address, lat, lon)
            if place_id in seen and seen[place_id] != identity:
                raise ValueError("Conflicting provider results")
            seen[place_id] = identity
            if (_normalized(name) == _normalized(location_name)
                    and _normalized(address) == _normalized(location_address)):
                matches[place_id] = place
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        raise DestinationResolutionError(unavailable=True) from None
    # Never declare uniqueness when some results are on an unseen page.
    if token or len(matches) != 1:
        raise DestinationResolutionError()
    return next(iter(matches.values()))


def _inside_campus(polygons, lat, lon):
    return any(_ring_contains(p[0], lon, lat) is True
               and all(_ring_contains(hole, lon, lat) is False for hole in p[1:])
               for p in polygons)


def resolve_destination(
    location_name: str,
    location_address: str,
) -> ResolvedDestination:
    """Require one exact normalized match and independently check campus geometry.

    Aliases and abbreviated addresses are deliberately rejected rather than
    inferred. No coordinates from the caller or Gemini are accepted.
    """
    if not all(_text(v) for v in (location_name, location_address)):
        raise DestinationResolutionError()
    polygons = _load_boundary()
    key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    if not key:
        raise DestinationResolutionError(unavailable=True)
    place = _select_match(_search(location_name, location_address, key), location_name, location_address)
    lat, lon = place["location"]["latitude"], place["location"]["longitude"]
    if not _inside_campus(polygons, lat, lon):
        raise DestinationResolutionError()
    return ResolvedDestination(
        locationName=place["displayName"]["text"], latitude=lat, longitude=lon,
        placeId=place["id"], scope="uf_campus",
    )
