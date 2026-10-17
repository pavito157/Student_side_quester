# Quest integration: frontend handoff and test report

Status on October 17, 2026: **Destination-first generation works through FastAPI.
Three requests with live Places + Gemini and local emulator persistence returned
HTTP 201 in 1.65s, 1.40s and 1.36s, with reload/reuse passing.** Firebase token
verification was mocked for those smoke tests; real browser/Firebase authentication
plus production Firestore is still a manual acceptance test. No UI component
files changed. Frontend teammates own button wiring.

## Current test evidence

- Final complete run: 171 backend tests passed against the loopback demo emulator.
- 28 separate resolver tests and 31 frontend service tests passed.
- Frontend build and lint passed.
- Automated tests cover actual default resolver wiring, provider HTTP parsing,
  city/distance filtering, activity-only Gemini schema, response models, real
  emulator persistence, completion and concurrent XP awards. Provider responses
  and token verification are mocked in the regression suite.
- Live smoke tests additionally exercise actual Gemini and Google Places, but
  keep token verification mocked and database writes local; records are cleaned up.
- Prior runs exposed intermittent exhausted transaction retries in concurrent
  emulator tests. Isolated and final full-suite reruns passed; monitor contention
  during load testing. No production transaction behavior is claimed from this.
- Three latency samples exclude browser token acquisition and production Firestore;
  they are observations, not a five-second guarantee. Opening hours, public access,
  venue fees and activity duration are not independently verified.

Captured response fixture: `contracts/assignment.response.tested.example.json`.
This is an actual local endpoint response with IDs/time sanitized. Its destination
is fictional test data, not a real venue. Use it for rendering tests,
never as production data. The versioned schema is
`contracts/assignment.response.schema.json`.

## Required setup for the live smoke test

Backend owner:

1. Finish the pending Git merge commit before pushing the integration branch.
2. Keep the existing Firebase Admin and Clerk bridge configuration. Sign in with
   a verified `@ufl.edu` account so `Users/{Firebase uid}` exists.
3. In ignored repository-root `.env` (the file loaded by the command below), set
   `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and `GAINESVILLE_BOUNDARY_PATH`.
   Use a server Places key with Places API (New) enabled in its Google project;
   browser website restrictions are inappropriate for the backend REST request.
   Do not weaken the frontend browser key's restrictions. No key goes into chat,
   Git, JSON payloads or `VITE_*` server-secret variables.
4. Supply the reviewed WGS84 city-limit polygon with the metadata described in
   `../docs/destination_resolver.md`. The bundled city-sourced boundary is described in `data/README.md`. Missing or
   invalid geometry blocks destination verification.
5. For completion testing, create/choose a real dorm document and set the test
   user's `dormId` accordingly. User and dorm balances use integer `xp` fields.
   Assignment creation itself does not require a dorm or award XP.
6. Review deployed Firestore rules: clients must not change XP, `activeQuestId`,
   quest definitions or assignment state; preserve authorized own-profile settings.
   Admin transactions bypass client rules. The emulator tests do not verify deployed rules.

From the repository root, using the project's Python environment:

```sh
python -m pip install -r backend/requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --env-file .env
```

Keep the frontend `VITE_API_BASE_URL` pointing to this backend. Restart the backend
after environment changes. CORS currently permits localhost/127.0.0.1 port 5173;
configure `FRONTEND_ORIGINS` for other origins.

## Frontend request and helper

Use `requestAssignedQuest`, not the test or preview helper, for the student button.
The existing helper obtains a Firebase ID token for the expected signed-in UID.
It sends `Authorization: Bearer <Firebase ID token>`; Clerk tokens alone are not
accepted by quest routes. Identity, radius and XP never come from request JSON.

Example JSON body (coordinates illustrative; send actual selected/device values):

```json
{
  "preferences": "I enjoy programming and nature.",
  "username": "Example Student",
  "location": "Selected starting place within Gainesville city limits",
  "originCoordinates": {"latitude": 29.65, "longitude": -82.34},
  "time": {"selection": "60", "customMinutes": null},
  "budget": {"selection": "0", "customDollars": null},
  "distance": {"maxDistance": 2, "unit": "miles"},
  "goals": ["Explore campus"],
  "vibePreferences": null
}
```

Distance is a positive straight-line miles limit, not driving/walking-route length.
Keep coordinates when the user picks a place or selects current location. Coordinates
must describe that selected origin, not a hardcoded value. With no distance limit,
use `distance: null`; for `location: "Anywhere"`, omit `originCoordinates`.
`vibePreferences` may be null. Time measures activity duration excluding travel:
`30`/`60` are maximum minutes; `120` means **2+ hours**, not a 120-minute maximum.
`custom` requires a positive whole-number `customMinutes`; otherwise use null.
Budget accepts `any`, `0` (free), `10` (under $10), `10-25`, or `custom` with
nonnegative `customDollars`. Time/cost remain model estimates, not external guarantees.

```ts
import { requestAssignedQuest, getCurrentQuest } from './services/questAssignment'

// uid is the connected Firebase UID; payload is the current selection JSON.
const result = await requestAssignedQuest(uid, payload, {
  signal: abortController.signal,
  onTiming: (timing) => console.log(timing), // durations only
})
// Render result.quest.title/description/steps/locationName,
// estimatedMinutes, estimatedCostDollars and xpReward.
// Keep result.quest.id for completion. Do not write assignment/XP yourself.
const reloaded = await getCurrentQuest(uid) // SavedQuestResponse | null
```

`POST /quests/assign` returns HTTP 201 for a newly committed assignment or HTTP
200 for the existing active one. Both have exactly this top-level shape:

```json
{"quest": {}, "assignment": {}, "reusedExisting": false}
```

Use the full captured fixture/schema for the nested fields. The helper returns a
`SavedQuestResponse` object, not a fetch `Response`. JSON timestamps are strings;
`assignment.status` is `assigned`, `completedAt` is null and `xpAwarded` is 0.
On `reusedExisting: true`, show the student's current assignment rather than claiming
it is newly generated from their latest preferences. `GET /me/quest` returns HTTP
200 and JSON null when no assignment is active. The helper validates the returned
account, IDs, timestamps, coordinates, radius and reward.

UI tasks: wire button; show loading/disable duplicate clicks; render quest; reload
on return; show actionable errors; cancel requests on account changes; refresh XP
and current quest after successful completion. Refreshing XP must be read-only.
No automatic retry loop on generation/provider errors; explicit retries may make
another paid provider request. A network failure after submission may mean the
assignment committed: reload `/me/quest` before asking to generate again.

## Completion

Send a **fresh** device location on Complete, not the saved origin or destination:

```http
POST /quests/{quest.id}/complete
Authorization: Bearer <Firebase ID token>
Content-Type: application/json

{"latitude": 29.65, "longitude": -82.34, "accuracy": 10}
```

Accuracy is the device-reported meters. Default maximum is 50 meters; conservative
proximity requires `distance + accuracy <= quest.radiusMeters`. This is separate
from the origin-distance filter. GPS proximity is not proof of the activity and
reported GPS can be spoofed. The server reads the stored quest/reward and atomically
rechecks assignment state and awards user/dorm XP once. Success returns
`valid`, `reason`, `distanceMeters`, `accuracyMeters`, `radiusMeters`, `questId`,
`status: "completed"`, `xpAwarded`. A repeat returns 409 without another award.

## Error contract

Errors use FastAPI's `{"detail": ...}`. `QuestApiError` preserves `status` and
`detail`; its message formats field errors for the UI. Completion location
rejections may put the validation object inside `detail`.

| HTTP | Meaning / UI behavior |
| --- | --- |
| 401 | Missing/expired/invalid Firebase token; reconnect/sign in |
| 403 | Account is not a verified UF account; show restriction |
| 404 | Quest/assignment missing on completion |
| 409 | No eligible destination found in the sampled city/distance search, incomplete profile/dorm, corrupt state, or already completed; show detail and refresh current state |
| 422 | Invalid selections/coordinates, distance without origin coordinates, or forbidden extra fields; fix request |
| 429 | Gemini quota/rate limit; wait before retrying |
| 502 | Invalid activity content, time/budget mismatch, or invalid selector result; explicit retry or adjust inputs |
| 503 | Resolver/key/boundary/database/provider unavailable; backend owner checks configuration |
| 504 | Gemini timeout; offer an explicit retry |

The legacy direct-name resolver requires the proposed name AND formatted address to
match Google's result after case/punctuation/whitespace normalization, ignoring
only an optional trailing US country label. Abbreviations
and omitted address parts may cause legitimate locations to be rejected. Production now avoids Gemini-authored locations by discovering and verifying
a provider venue before generation. The strict helper remains available for
direct name/address lookups.

## Test cases and live acceptance

| Case | Expected result | Local automated coverage |
| --- | --- | --- |
| Valid frontend JSON, real resolver wiring | 201 structured JSON; quest + assignment + user pointer saved atomically | Passed, provider I/O mocked |
| Null vibe and object distance + origin | Accepted; distance validated | Passed |
| Missing origin, bad unit, invalid GPS/accuracy | 422/400, no completion/award | Passed |
| No/invalid token, non-UF/unverified account | 401/403 | Passed with mocked token verification |
| No unambiguous candidate within city/distance bounds | 409 before Gemini; no saved records/XP | Passed |
| Missing key/boundary or provider failure | 503, no saved records/XP | Passed |
| Destination beyond requested distance | 409, no saved records/XP | Passed |
| Second assign/reload | 200 same quest; reusedExisting true; no repeated provider call | Passed |
| Concurrent assign / aborted commit | At most one active quest; no orphan records | Passed against emulator |
| Complete while far away or inaccurate | Rejected; XP unchanged | Passed |
| Complete nearby, then repeat/concurrent repeat | One award to user/dorm; repeat 409 | Passed against emulator |
| Legacy totalXp/profile initialization races completion | Canonical xp preserves balance/award | Passed against emulator |
| Live Gemini/Places + bundled city boundary + emulator | 201, valid saved JSON, reuse/reload | Passed, token verification mocked |
| Real device arrival + deployed Firestore rules | Fresh location completes once; unauthorized client writes denied | Pending live test |
| End-to-end latency | Read Server-Timing and helper onTiming across several fresh requests | Pending live providers |

For the live smoke test, use a consenting UF test account. First try a free quest,
60-minute activity maximum, no distance filter. Check the JSON before connecting
UI rendering. Then test a distance filter with actual origin coordinates and reload.
Do not fake production GPS to award XP; test arrival with a real device, or keep
completion tests in the emulator. Existing active assignments are reused, so they
cannot measure fresh Gemini/Places latency. Do not promise five seconds until the
full live pipeline is measured.

Commands from repository root:

```sh
# Set FIRESTORE_EMULATOR_HOST only to a running loopback emulator, never production.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8787 python -m unittest discover -s backend/tests -q
python -m unittest discover -s tests -p 'test_destination_resolver.py' -q
```

From `Sidequester_Frontend`:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

## Historical Gainesville pivot smoke test (superseded by destination-first flow)

The API geographic scope is now `gainesville_city`. Set
`GAINESVILLE_BOUNDARY_PATH=backend/data/gainesville-boundary.geojson`; the old UF
boundary variable/scope is no longer used. The Gemini prompt allows Gainesville
city destinations. The frontend preview helper's scope check/type was updated;
UI components and the saved assignment JSON shape are unchanged. Verified UF
account authentication, the origin-distance filter and GPS completion remain.

The server Places key and bundled city geometry passed live checks for Reitz
Union and downtown Bo Diddley Plaza on October 17. One live Gemini-to-resolver
preview returned 502 (unverified destination) in 1.85 seconds. There was no saved
assignment or XP award. This is not a successful full live generation test; assess
proposal/name/address matching and geographic rejection before claiming reliability.
See `data/README.md` for the boundary source and geometry normalization.

An initial Gainesville regression run hit an exhausted-retry error in the
concurrent same-dorm XP test on the local emulator. Its isolated rerun passed;
the final full-suite rerun passed all 163 tests. This contention behavior should
be monitored during broader load testing.

## Historical address-matching diagnosis (superseded by destination-first flow)

A live Depot Park lookup showed Gemini omitted `, USA`; Google returned the same
street/city/ZIP plus `, USA`. Address comparison now permits that exact formatting
difference (including `US`/`United States` variants). It does not fuzzy-match names,
ignore street numbers, substitute ZIPs, accept foreign countries or bypass city
containment. Four new resolver regressions cover these acceptance/rejection cases;
the real FastAPI/emulator path also tests a provider-only country suffix.

Three fresh FastAPI smoke requests with live Gemini/Places and local emulator
persistence produced:

| Result | Time | Evidence |
| --- | --- | --- |
| Baughman Center rejected, 502 | 1.79s | Gemini street 986/ZIP 32611 differed from Google's 982/32603 |
| Depot Park saved, 201 | 2.85s | Saved JSON validated; reload and second-request reuse passed; XP unchanged |
| Kanapaha Botanical Gardens rejected, 502 | 1.34s | Name/address matched but coordinates were outside city limits |

Firebase token verification was mocked for these in-process smoke requests; no
production account or Firestore data was written. All local records were cleaned
up. The successful response with IDs/time sanitized is
`contracts/assignment.response.live.example.json`. It is a rendering fixture,
not a production assignment. These three samples do not establish a latency or
success-rate guarantee. Destination selection before Gemini generation is the
recommended follow-up to avoid invented/out-of-city proposed destinations.

## Current pipeline: verify destination before Gemini

This supersedes the earlier propose-then-resolve flow and its failure measurements.
Production order is now:

1. Return the existing active assignment immediately when present.
2. Google Places supplies live candidate venues (not hardcoded quests).
3. Validate records, deduplicate IDs, exclude ambiguous same-name/address records,
   and filter by the city polygon and any requested straight-line origin distance.
4. Randomly select an eligible venue. Gemini receives the canonical name/address,
   preferences and time/budget bounds; its output schema has activity fields only.
5. The server attaches the provider's name/address/GPS/place ID, checks activity
   estimates, then atomically saves and returns the same public JSON contract.

One Places query and one Gemini call per fresh successful assignment; no provider
calls occur inside Firestore retries and there is no automatic generation retry.
Search uses simple category hints from preferences/goals/vibe (parks by default,
public libraries for reading/study, optional galleries/museums/cafes/restaurants
when the budget allows). Location bias is only a provider hint; city/distance
filters are enforced locally. One result page is sampled, so a 409 means no
eligible result was found in that search, not proof none exists in Gainesville.
Open hours, entry permission, admission cost and actual visit duration are not
verified by the candidate search; activity cost/time remain estimates.

Missing configuration/provider failure returns 503 **before Gemini**. No eligible
or unambiguous candidates within city/distance limits returns 409, also before
Gemini or any assignment write. Legacy direct `resolve_destination(name, address)`
remains strict and available to the teammate; production generation uses discovery.

Three fresh requests using live Places + Gemini and local emulator persistence
all returned HTTP 201: Cofrin Nature Park (1.65s), Albert Ray Massey (Westside) Park
(1.40s), Boulware Springs Park (1.36s). Reload/reuse passed for all three, without
additional generation; XP stayed unchanged. Token verification was mocked in
these isolated in-process smoke tests. This is not a real browser/Firebase auth
or production Firestore latency measurement, and three samples are not a guarantee.
The live response fixture now contains the successful destination-first result.

Frontend action: continue using `requestAssignedQuest(uid, payload)` and
`getCurrentQuest(uid)`. Request shape and saved-assignment JSON are unchanged;
no UI component files changed. Display a 409 discovery message and allow widening
the distance/changing preferences instead of repeatedly resubmitting automatically.
