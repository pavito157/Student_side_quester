# Destination resolver

`backend/destination_resolver.py` uses Google Places API (New) Text Search through
Python's standard library. No new Python packages are required. It searches the
name and address together, requires exactly one distinct place ID with matching
name and formatted address, then checks the provider's coordinates against a
separate local campus polygon. Ranking is never used to choose a winner.

Lookup (`_search`), candidate validation/selection (`_select_match`), and campus
membership (`_inside_campus`) are separate helpers. Every returned candidate
must have a nonempty name, address and ID, and finite, in-range coordinates.
One exact match among unrelated candidates is accepted. Repeated identical IDs
are deduplicated; conflicting records for the same ID are operational failures.

Matching ignores case, punctuation and whitespace, but does not expand street
abbreviations or accept aliases. This deliberately favors false rejections over
guessing. Supply the complete provider-formatted address, including city, state,
postal code and country when present. An unseen result page is rejected as
ambiguous. Provider search is not an exhaustive registry or a guarantee of real
world accuracy; conservative matching still depends on Google's data quality.

## Configuration

Set these environment variables in the backend process (PowerShell example):

```powershell
$env:GOOGLE_PLACES_API_KEY = '<your server API key>'
$env:UF_CAMPUS_BOUNDARY_PATH = 'C:\path\to\reviewed-uf-gainesville.geojson'
```

The Google project needs Places API (New) enabled and appropriate billing/key
restrictions. This work does not enable services, create resources or make live
requests. API usage may incur charges. Never put a real key in source control.
The resolver does not automatically load `.env` files.

## Boundary is required before production use

No production campus polygon is included: an authoritative machine-readable
Gainesville campus boundary has not been verified for this checkout. Obtain one
from UF GIS / Business Affairs Technical Services, confirm which Gainesville
campus parcels are in scope, and have a maintainer review the export against UF's
published campus planning/map sources:

- https://gis.ufl.edu/
- https://bats.facilities.ufl.edu/services.html
- https://campusmap.ufl.edu/
- https://facilities.ufl.edu/campus-planning/campus-master-plan/campus-master-plan-2020-2030/

UF's **university context area** includes surrounding areas and is NOT a campus
boundary. Do not substitute it, a radius, a bounding rectangle, a historic
district, or all UF-owned properties for the requested Gainesville boundary.

The file must be a GeoJSON Feature with a Polygon or MultiPolygon, using WGS84
`[longitude, latitude]` coordinates and closed rings. Exterior rings come first;
subsequent rings are holes. Add these feature properties:

```json
{
  "scope": "uf_campus",
  "source_url": "<actual UF source URL or dataset reference>",
  "reviewed_by": "<maintainer>",
  "reviewed_on": "<YYYY-MM-DD>"
}
```

Those properties record provenance; they do not authenticate a dataset. The file
is trusted deployment configuration, never user/Gemini input. Validate topology
(no self-intersections, overlapping holes or degenerate rings) in GIS tooling
before deployment. The loader checks structure/coordinate ranges, not full GIS
topology. Points on polygon edges or hole edges are rejected conservatively.
Missing/malformed configuration fails closed as `unavailable=True`, before any
provider request. No location gets campus scope until the polygon check passes.

## Errors and integration

Unknown places, multiple exact matches, mismatches, unseen result pages, and
out-of-scope coordinates raise `DestinationResolutionError()`. Network failures,
timeouts, HTTP errors (including quota/key failures), malformed provider data,
and missing configuration raise `DestinationResolutionError(unavailable=True)`.
Provider bodies and credentials are not included in error messages.

The two required shared imports are preserved. Neither shared module is supplied
or modified here. Once your teammate adds them, ensure `ResolvedDestination`
accepts the five specified fields and the error accepts `unavailable=True`.
Call this synchronous helper after generation and before saving/assigning a
quest. In an async FastAPI handler, run it in a worker thread to avoid blocking
the event loop during its bounded (10 second) HTTP request. Authentication,
Firestore, Gemini and XP logic remain outside this helper.

There is a potential circular import: the resolver imports the exception from
`quest_generation`, so that module must not import this resolver at module level
before defining its exception. Later integration can defer the reverse import
inside a factory function. `get_destination_resolver()` is not connected here.

## Offline tests

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_destination_resolver.py' -v
```

The tests temporarily inject in-memory doubles for both shared modules while
loading an isolated resolver module, then restore `sys.modules`. They mock HTTP
responses and use a synthetic polygon, which is explicitly NOT campus data.
They do not import the app, initialize Firebase, read credentials or contact
Google. Passing tests validate resolver behavior with doubles; real-contract
integration and real-provider/campus-data validation remain unverified until the
shared modules, reviewed boundary and provider configuration are available.

The real-destination test uses the Reitz Union name/address documented at
https://union.ufl.edu/visit/location-parking-directions/ . Its ID and coordinates
are deliberately mocked. All polygons in tests are synthetic; near-edge tests
exercise strict inclusion without claiming to test an approved UF boundary.
Tests using actual approved campus geography remain blocked until that data is
provided. The test suite also covers a clear match among multiple candidates,
ambiguity, missing configuration, incomplete/malformed responses, duplicate IDs,
holes, MultiPolygons, and inside/outside/on/near-edge points.
