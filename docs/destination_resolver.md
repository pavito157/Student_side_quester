# Gainesville destination resolver

The resolver uses Google Places API (New) Text Search to resolve a proposed name
and address. It requires exactly one distinct place matching both after case,
punctuation and whitespace normalization (ignoring only an optional trailing US
country label), validates provider coordinates, and
checks them against Gainesville's municipal boundary. It does not choose a match
by search ranking. Unknown, ambiguous, outside-city and boundary-edge points fail.
Street abbreviations, aliases or missing street/city/ZIP details may cause false rejections;
measure live generation success before relaxing or redesigning matching.

## Configuration

In the ignored root `.env` loaded by `uvicorn --env-file .env`:

```dotenv
GOOGLE_PLACES_API_KEY=<server Places API key>
GAINESVILLE_BOUNDARY_PATH=backend/data/gainesville-boundary.geojson
```

Run from the repository root, or use an absolute boundary path. Enable Places API
(New) in the key's Google project and use server-appropriate key restrictions.
Keep the browser `VITE_GOOGLE_MAPS_API_KEY` separate. Never commit credentials.
The helper itself does not load dotenv.

The bundled [boundary](../backend/data/gainesville-boundary.geojson) comes from
[the city municipal boundary layer](https://services2.arcgis.com/Zzhtlau4ccHkQgTu/ArcGIS/rest/services/Gainesville_Boundary/FeatureServer/0).
See [provenance and geometry processing](../backend/data/README.md). The old
`UF_CAMPUS_BOUNDARY_PATH` and `uf_campus` scope are replaced by
`GAINESVILLE_BOUNDARY_PATH` and `gainesville_city`. UF-only account authentication
is unchanged. The student distance filter remains a separate straight-line check.

The configured file must be a WGS84 GeoJSON Feature with Polygon or MultiPolygon
geometry, closed rings in `[longitude, latitude]` order, and properties `scope:
"gainesville_city"`, `source_url`, `reviewed_by`, `reviewed_on` (ISO date).
Provenance fields record review; they cannot authenticate an arbitrary dataset.
Loader validation checks structure/ranges; review topology when replacing data.
Missing or malformed configuration fails closed before the Places request.

## API contract and errors

```python
resolve_destination(location_name: str, location_address: str) -> ResolvedDestination
# locationName, latitude, longitude, placeId, scope="gainesville_city"
```

The direct name/address helper is retained for callers. Production FastAPI
uses `VerifiedDestinationSelector`: Google supplies candidates first, local
city/distance checks filter them, then Gemini writes the activity at a selected
provider venue. It does not ask Gemini to invent addresses. No eligible candidates
return 409 before generation; discovery configuration/provider failures return 503.

For the legacy direct name/address helper: Unknown/ambiguous matches,
unseen result pages and outside-city results raise `DestinationResolutionError()`;
provider HTTP/network failures, invalid responses and missing configuration raise
`DestinationResolutionError(unavailable=True)`. FastAPI maps these to 502 and 503
respectively, without saving an assignment or forwarding provider bodies/secrets.

Tests from repository root:

```sh
python -m unittest backend.tests.test_gainesville_boundary -v
python -m unittest backend.tests.test_destination_resolver -v
```

The standalone resolver suite uses isolated shared-module doubles and synthetic
geometry. The backend integration suite additionally exercises real shared models,
actual default dependency wiring, actual resolver parsing and emulator persistence.
Google/Gemini responses and token verification are mocked in those automated tests.
Live provider tests and their limitations are documented in the frontend handoff.

## Destination discovery

`VerifiedDestinationSelector.select(preferences)` returns internal
`SelectedDestination` (canonical address plus `ResolvedDestination` fields).
It validates all records, deduplicates exact IDs, rejects conflicting ID data,
excludes ambiguous same-name/address groups, and filters actual Google coordinates
against the city boundary and optional straight-line distance. It randomly picks
one eligible result. Discovery samples one page; unlike a direct exact-name lookup,
it does not infer uniqueness over unseen pages or claim an exhaustive place list.
Category hints choose parks/libraries or budget-appropriate galleries/museums/cafes/
restaurants. No predefined quests or venue coordinates are used.

Only canonical name/address are sent to Gemini, not coordinates, place IDs, user
IDs or XP. Gemini's production schema contains activity text, steps, completion
criterion and estimated time/cost only. The server attaches destination metadata.
Existing assignments are reused without new provider calls. See the frontend
handoff for live smoke-test measurements and limitations.
