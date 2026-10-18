# Current behavior: three independent active quests

This section supersedes the single-active/replacement behavior in the historical
integration notes below. Sidequest me and Generate another now **add** quests,
up to three active quests total. They never replace an existing quest. Each card
in Quick menu opens its own description, steps, original request, verified map,
XP reward, GPS completion and confirmed Abandon controls. Completing/abandoning
one removes only that quest and frees a slot. Generation/abandonment awards no XP;
completion still awards user and dorm XP once with the existing GPS checks.

- `POST /quests/assign`: HTTP 201, unchanged saved-assignment JSON.
- `POST /quests/{quest.id}/another`: HTTP 201, same JSON, source remains active.
- `GET /me/active-quests`: HTTP 200 array of all saved active assignments (0–3).
- `/me/quest` remains a singular compatibility view of the most recent quest.
- Deprecated `/quests/{quest.id}/replace` now adds non-destructively too.
- Fourth active assignment: HTTP 429 before generation; final transactional check
  also prevents concurrent requests exceeding three. Stale source ID: HTTP 409.

`getActiveQuests` reconciles old replacement chains once on account load; the
Firestore listener keeps the list/count current across routes. Up to two recent
skipped ancestors of an active quest are restored (three total), with a per-user
schema marker preventing repeat recovery. Deleted completed/abandoned quests are
never recreated. `replacementCount` is retained only as legacy response metadata;
remaining slots are based on the active list, never that counter.

Manual test: refresh, generate until three active cards appear in Quick menu,
select each and read its contents/steps. Refresh again. Abandon the second card;
confirm only it disappears, XP is unchanged, and another generation is allowed.
At three, Generate another is disabled and direct POSTs return 429. GPS completion
of one selected quest awards its stored user/dorm reward once and leaves the
other quests intact. After an ambiguous network error, reload the list before
retrying a POST, since it may already have committed.

Validation: 209 backend tests passed with local Firestore emulator transactions;
70 frontend tests, production build and lint passed. Tests cover capacity races,
individual completion/abandonment, one-time alternative recovery, all three card
links, full contents/steps, and account changes. No production test records created.
The local API was restarted with the new endpoints.

See [TASK5_API.md](TASK5_API.md) for the current contract. Earlier measurements
and behavior below describe the implementation at the time they were recorded.

## Main integration: guest previews and multi-stop routes

Merged `origin/main` at `cca22a3` while retaining the three-independent-quests
workflow. Guest generation opens an unsaved preview and never creates an active
assignment. Signed-in generation can request a two-to-ten-stop route with
`multiQuest: true` and an explicit origin. A route occupies one active slot,
keeps its own ordered `destinations`/`completedStops`, and remains active after
partial completion. Each GPS-verified stop awards its share of the stored reward
to both user and dorm; only the final stop deletes that quest and frees its slot.

The updated map/directions/grid layout is preserved. Generate another still adds
without replacing, uses the saved/latest preferences, and retains duplicate-action
and account-switch protection. Prompts combine the source-activity variety rules
with verified stop order, without forwarding GPS, identity, tokens or XP to Gemini.
The reusable completion helper/button now handles `in_progress` without claiming
that the whole route is complete or displaying an object as XP.

Validation: 216/216 backend tests passed using local Firestore emulator
transactions; 76/76 frontend tests, production build and lint passed. New merged
checks cover guest multi-stop previews without persistence, three active quests
including a route, blocked fourth generation, sequential GPS stop verification,
partial XP for user/dorm, replay protection and preservation of other quests.
Provider/auth I/O was mocked; no production Firestore test records were created.

---

# Quest integration: frontend handoff and test report

Status on October 17, 2026: **Destination-first generation works through FastAPI.
Three requests with live Places + Gemini and local emulator persistence returned
HTTP 201 in 1.65s, 1.40s and 1.36s, with reload/reuse passing.** Firebase token
verification was mocked for those smoke tests; real browser/Firebase authentication
plus production Firestore is still a manual acceptance test. Button wiring and the response modal are now implemented; see the section
"Sidequest button wiring" below.

## Current test evidence

- Backend quest suite: 145 passed, 39 emulator-dependent tests skipped; XP suite: 7 passed.
- Frontend node suite: 52 passed; frontend production build and lint passed.
- Build output retains the existing large-chunk warning. No live provider or
  production Firestore behavior is claimed from these automated tests.

Captured response fixture: `contracts/assignment.response.tested.example.json`.
This is an actual local endpoint response with IDs/time sanitized. Its destination
is fictional test data, not a real venue. Use it for rendering tests,
never as production data. The versioned schema is
`contracts/assignment.response.schema.json`.

## Required setup for the live smoke test

Backend owner:

1. Finish the pending Git merge commit before pushing the integration branch.
2. Keep the existing Firebase Admin and Clerk bridge configuration. Sign in with
   a verified email account so `Users/{Firebase uid}` exists.
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
  "vibePreferences": null,
  "multiQuest": false
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

`POST /quests/generate` is public and produces an unsaved preview for guests or
signed-in users; guest results are held only in frontend memory and are lost on
refresh/navigation. Keep the non-persistence warning visible. Since generation
uses paid providers, production deployments should enforce edge rate limits and
provider quotas.

The request's optional `multiQuest` flag defaults to false. When true, include
`originCoordinates`; Gemini selects a purposeful route of two to ten distinct,
resolver-verified destinations from a diversified candidate pool. The ordered
`stepDestinationIndexes` mapping groups one or more action steps with each
route stop. Saved multi-stop assignments persist ordered `destinations`,
`completedStops` (zero-based indexes), and `xpAwardedSoFar`. The map shows the
origin and every stop and draws a walking route to the first stop. Completion
requires the next `stopIndex` and a fresh GPS reading; each stop awards its XP
share, and only the final stop removes the assignment. Abandoning does not refund
XP already credited for completed stops.

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
rechecks assignment state, deletes the active assignment, and awards user/dorm XP
once. Success returns `valid`, `reason`, `distanceMeters`, `accuracyMeters`,
`radiusMeters`, `questId`, `status: "completed"`, and `xpAwarded`. A repeat finds
no active assignment and cannot award XP again.
For multi-stop quests, include `stopIndex` in the body. A successful partial
completion returns the increment awarded in `xpAwarded`, cumulative
`xpAwardedSoFar`, and updated `completedStops`; stops must be completed in order.

`POST /quests/{quest.id}/abandon` deletes the authenticated user's active
assignment without XP. The detail page should ask for confirmation before
abandoning and reload/leave the detail view after the server confirms deletion.

## Error contract

Errors use FastAPI's `{"detail": ...}`. `QuestApiError` preserves `status` and
`detail`; its message formats field errors for the UI. Completion location
rejections may put the validation object inside `detail`.

| HTTP | Meaning / UI behavior |
| --- | --- |
| 401 | Missing/expired/invalid Firebase token; reconnect/sign in |
| 403 | Account is not a verified-email account; show restriction |
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
| No/invalid token or unverified account | 401/403 | Passed with mocked token verification |
| No unambiguous candidate within city/distance bounds | 409 before Gemini; no saved records/XP | Passed |
| Missing key/boundary or provider failure | 503, no saved records/XP | Passed |
| Destination beyond requested distance | 409, no saved records/XP | Passed |
| Second assign/reload | 200 same quest; reusedExisting true; no repeated provider call | Passed |
| Concurrent assign / aborted commit | At most one active quest; no orphan records | Passed against emulator |
| Complete while far away or inaccurate | Rejected; XP unchanged | Passed |
| Complete nearby, then repeat/concurrent repeat | One award to user/dorm; active assignment deleted; repeat 404 | Passed against emulator |
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
python -m unittest backend.tests.test_destination_resolver -q
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
the button is now wired (see below). Display a 409 discovery message and allow widening
the distance/changing preferences instead of repeatedly resubmitting automatically.

## Sidequest button wiring

The Sidequest me button starts the generation flow. Signed-in students call
`requestAssignedQuest(uid, payload)` and navigate to the saved quest detail page;
guests call `requestGeneratedQuest(null, payload)` and see an unsaved preview.
Only FastAPI saves assignments. `assignment.xpAwarded` stays 0 at assignment time,
and the client does not award XP.

Examples and schema remain `contracts/assignment.response.live.example.json` and
`contracts/assignment.response.schema.json`. The response shape did not change.
Request builder/types now optionally carry `originCoordinates`; selected-place and
current-location controls retain their numeric coordinates. Selecting Anywhere
clears them. Distance without captured coordinates shows an actionable error; a
saved vibe with only a location label must be selected again to capture coordinates.
The prior `getCurrentLocationLabel` helper remains available for other callers.

Loading disables duplicate submission. Backend errors display on the quest page.
The button no longer creates a second browser-owned prepared request, and guests do
not call the protected assignment endpoint.

Component tests exercise submission payloads, guest previews, duplicate clicks,
backend response validation and user-owned quest storage. A real signed-in button
click against production Firestore remains a manual check (no student login was automated).

Manual check: run the backend and frontend, sign in with a verified-email account,
select a place/current location if using distance, click Sidequest me. Confirm
Network POST `/quests/assign` returns 201 (new) or 200 (reused), and the saved quest
appears at `Users/{uid}/sidequests/{quest.id}`. Confirm the detail page shows the
stored reward and that `assignment.xpAwarded` is 0. Click again and confirm the same
active quest is reused. The quest list/detail page reads the backend-owned user
subcollection, and the detail Complete button calls FastAPI with fresh GPS.

## Hackathon authentication update

All verified email domains are now accepted. The UF-only policy and temporary
email allowlist have been removed from both the Clerk-to-Firebase bridge and
protected Firebase-token routes. Token verification, verified primary email,
account status, UID binding and ownership checks remain required. Restart the
backend after updating the code; the frontend sign-in message reflects this policy.
The authentication changes passed 141 backend tests (32 emulator-dependent tests
skipped) and the frontend passed 42 tests, build and lint.

## Merged coordinate payload fix

The merged frontend retains top-level latitude/longitude for its existing map and
request-history records. These are not valid FastAPI request fields. The button
now uses `toQuestApiPayload(request)` before submitting or showing Request JSON:
only nested `originCoordinates` travels to `/quests/assign`. History/map records
keep their existing fields. Do not send the internal request object directly to
FastAPI or loosen the backend's extra-field validation to accept the duplication.
The actual frontend-built payload passed the real FastAPI route's validation and
returned 201 with mocked services; no live data was modified. Frontend regression
suite: 43 tests passed; build and lint passed.


## User-owned generated sidequests (current storage contract)

New generated quests are saved at `Users/{Firebase uid}/sidequests/{quest.id}`.
The child document combines quest content and assignment state. See
`contracts/user-sidequest.document.example.json` for its fields (timestamp fields
are represented as ISO strings in that JSON example; Firestore stores timestamps).
The existing structured HTTP response and its schema do not change.
`assignment.id` stays `{uid}_{questId}` as a public API identifier; use `quest.id`
as the Firestore document ID and detail-page route ID.

Frontend changes: the button stops writing duplicate prepared request documents;
the list and detail page read actual generated content from the user's
subcollection, use destination GPS for the map, and show the backend reward.
Complete requests fresh GPS and calls `POST /quests/{quest.id}/complete` with a
Firebase ID token. Client code no longer awards XP or deletes expired records.
Generated assignments remain active until completed; they do not inherit the
old preview snapshots' three-day expiration. Legacy prepared snapshots are
retained in Firestore but excluded from the generated quest list. Existing active
global assignments migrate transactionally when requested, without awarding XP.
The old assignment is marked migrated to prevent duplicate completion via old
code. No production bulk migration or deletion is performed.

Firestore rules must allow the signed-in owner to read their sidequests and deny
client creation/update/deletion of those documents. User `xp`, legacy `totalXp`,
`activeQuestId`, and dorm XP must also remain server-owned. Firebase Admin bypasses
client rules. Rules are managed outside this repo: no rules were deployed or
verified here. A broader permissive rule can override a narrower denial, so the
backend teammate must check the project's effective rules before relying on XP
integrity. An owner-read/backend-write subcollection rule is:

```text
match /Users/{uid}/sidequests/{questId} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}
```

Manual check after restarting FastAPI: sign in, click Sidequest me, and confirm
201/200 plus unchanged response JSON. In Firestore, open Users → your Firebase
UID → sidequests → response.quest.id; the content should match the response.
Refresh and open the active quest: title/steps/destination/XP should persist.
Complete from outside the radius to see rejection, then at the destination with
good accuracy and a valid dorm to earn the stored reward. A repeated completion
returns 404; user/dorm XP increase once, and the active assignment is deleted.

Validation for the storage transition: full backend suite 178/178 passed with the
local Firestore emulator. Frontend 49/49 tests passed, as did
the TypeScript/Vite build and lint. Tests use mocked authentication and provider
responses with real emulator transactions. No signed-in production completion or
Firestore rules deployment was performed.

## Luis_backend compatibility fixes

The teammate additions now reuse the existing architecture:

- `auth.get_current_user_id` is the existing Firebase `current_uid` dependency.
  Clerk sessions are exchanged through `/auth/firebase` as before; completion
  never accepts a raw Clerk session token instead of the Firebase ID token.
- `firebase_config.db` is a lazy alias for `backend.auth.firebase_helpers.get_db()`.
  Imports do not initialize credentials. Existing Firebase app/ADC configuration
  (including `GOOGLE_APPLICATION_CREDENTIALS` in the ignored root `.env`) works;
  there is no required root `serviceAccountKey.json` filename.
- `xp_service.complete_assigned_quest(uid, questId, latitude, longitude, accuracy)`
  delegates to `backend.quests.quest_completion.complete_quest`. GPS is required. The
  canonical transaction reads `Users/{uid}/sidequests/{questId}`, validates
  ownership/state/destination/accuracy/proximity, then atomically completes the
  assignment and updates both `Users/{uid}.xp` and `dorms/{dormId}.xp`. No separate
  `assignedQuests` collection or reward field named `xp` is introduced. Concurrent
  and repeated completion cannot award twice; replay remains HTTP 409.
- `services/questApi.completeQuest(expectedUserId, questId)` uses the existing
  fresh-GPS service and Firebase-authenticated HTTP helper. Its return value is
  `{status: "completed", xpAwarded: number}`. The full HTTP completion response
  still includes `valid`, `reason`, distance/accuracy/radius and `questId`.
  `VITE_API_BASE_URL` remains the single frontend API setting.
- `CompleteQuestButton` remains an optional reusable component. Its existing
  `assignedQuestId` prop must be **response.quest.id**, not assignment.id. It
  shows location/error/success feedback, disables duplicate clicks and handles
  zero-XP success. Current detail-page layout is unchanged and already uses the
  same completion service. Frontend teammates can import the optional button
  without building another authentication or GPS flow.
- One CORS layer uses `FRONTEND_ORIGINS` for both API preflights and the Clerk
  bridge. Defaults include localhost and 127.0.0.1 on ports 5173 and 5174. An
  explicit environment setting replaces those defaults; include the actual
  frontend origin and restart FastAPI after changing it. Untrusted origins stay
  blocked; `Server-Timing` remains exposed.
- `.env.*`, Firebase Admin key filenames and service-account patterns are ignored
  again; `.env.example` remains shareable. Root `requirements.txt` includes
  `backend/requirements.txt` so both installation entry points use the same deps.

### Manual verification

1. Start/restart FastAPI from the repository root with the existing environment:
   `python -m uvicorn main:app --host 127.0.0.1 --port 8000 --env-file .env`.
   Start Vite from `Sidequester_Frontend` with `npm run dev`. No new key is needed.
2. Sign in with any verified email. Click Sidequest me and confirm the same
   structured assignment JSON including `quest.id` and `quest.xpReward`.
   Open Users → your Firebase UID → sidequests → quest.id in Firestore.
3. Open that quest's detail page and click Complete. In browser Network, verify
   `POST /quests/{quest.id}/complete`, a Firebase Bearer token (do not share it),
   and JSON `{latitude, longitude, accuracy}` from a fresh device reading.
4. Deny location access: display a location error and send no completion request.
   Outside the destination radius / with poor accuracy: expect HTTP 400 with a
   reason. User XP, dorm XP and assignment state must remain unchanged.
5. With accurate GPS at the destination and an existing valid user dorm, expect
   HTTP 200 and `xpAwarded === quest.xpReward`. Both user and dorm XP must increase
   by that amount. The stored sidequest is completed/inactive and its active
   pointer cleared. Retry the same authenticated request: expect 409 and no
   additional XP. Missing/invalid dorm also returns 409 without completing.
6. Load Vite through `localhost` and `127.0.0.1` on the allowed port; requests
   should pass CORS. Keep `FRONTEND_ORIGINS` consistent if explicitly configured.

### Automated verification

```sh
# Backend; run an emulator on loopback:8787 for the full transaction suite.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8787 python -m unittest discover -s backend/tests

# From Sidequester_Frontend:
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

Without the emulator environment setting, transaction tests skip rather than
access production Firestore. Regression tests cover the optional button/helper
through actual frontend service modules, Firebase token selection, fresh GPS,
camelCase server rewards, signed-out/account-switch errors, duplicate clicks,
CORS hostnames/ports/custom origins, lazy Firebase initialization, and the
teammate backend helper's GPS/dorm rejection and concurrent user/dorm XP awards.
Authentication/provider responses are mocked; Firestore transaction tests use
real local emulator transactions. A signed-in production completion and deployed
Firestore rules still require the team's manual verification.

Compatibility-fix validation: 184/184 backend tests passed with real loopback
emulator transactions; 56/56 frontend tests passed; build and lint passed. The
restarted API passed health and preflight checks for localhost/127.0.0.1 on
port 5173 using the existing local environment. The local root .env explicitly
limits FRONTEND_ORIGINS to port 5173, so port 5174 correctly remains blocked there
until it is added to that setting; default-config tests cover both ports.
Production Firestore records were not modified by these tests.

## Quest-design prompt improvements from backend branch

Adapted `e7d361d` (Improve Gemini quest generation prompt) into
`backend/quests/quest_generation.py`. Kept its concrete adventures, natural preference
matching, activity variety, measurable endpoints, single-place activities and
avoidance of homework/vague reflection. Condensed repeated rules and removed the
unused alternate prompt. Added explicit cautions against assuming paths, benches,
weather-dependent shadows and required drawing equipment.

The prompt now makes a destination-based outing the primary objective. Vibe
preferences shape the experience's mood, pace, and social/playful style; personal
interests are supporting inspiration, while goals are the lightest influence.
Destination discovery similarly leads its profile-informed place search with vibe
and personal preferences, without using goals as place-search terms.

The scope stays Gainesville city limits. The normal destination-first flow tells
Gemini to use only the already selected venue and return activity fields, without
contradictory requests to choose another UF destination or generate an address.
Legacy unverified previews can still propose a name/address. Both modes share the
same quest-design rules; no fragile substring extraction of prompt wording.
Response JSON, reward/GPS ownership, model, thinking depth, one-candidate limit,
timeouts and output-token budget remain unchanged. No frontend changes for this
prompt update. This is guidance to a generative model, not a deterministic
quality, novelty, amenity or activity-duration guarantee.

Validation: 59 generation/contract/assignment-route tests passed. Four synthetic
live Google Places/Gemini previews passed schema and time/budget validation,
without Firestore writes. Initial samples took 1.98s and 1.62s; after tightening
feature/equipment wording, final samples took 1.63s and 1.51s. These observations
exclude browser token acquisition and assignment persistence.

To inspect fresh output, use authenticated `POST /quests/generate` (or the frontend
`requestGeneratedQuest` helper), which returns an unsaved preview. Sidequest me /
`POST /quests/assign` intentionally reuses an existing active assignment, so that
quest does not change just because the prompt was edited. Completion and a new
assignment will use the updated prompt on the next generation.

## Generate another button

Open Sidequest me and use **Generate another** in the result modal. It uses the
page's latest filters/preferences/vibe to request a new saved quest through
`requestReplacementQuest(uid, currentQuestId, payload, options)` →
`POST /quests/{currentQuestId}/replace`. The structured response JSON is unchanged.
The current quest remains visible during generation and after errors. The modal
explains that replacement skips the old quest without XP. Duplicate clicks are
blocked; account changes retain the existing cancellation/reset behavior.

On success, the old record is `skipped`/inactive with `skippedAt` and
`replacedByQuestId`, and the new record is assigned under the same user's
`sidequests` subcollection. XP remains unchanged for both user and dorm. The active
list automatically displays the replacement. Old skipped records stay as history,
and their completion requests return 409. If another tab replaces or completes
the displayed quest while generation is running, that state is preserved and the
stale replacement returns 409. Close/reopen Sidequest me to load the current quest.

Manual check: open an existing quest, click Generate another, confirm a new
`quest.id` and response JSON. Refresh: the replacement should remain active.
Check the old Firestore record is skipped with `xpAwarded: 0`, and user/dorm XP
is unchanged. Change page filters and repeat to inspect the updated request JSON.
If generation fails, the old quest should remain active and visible. Completing
the skipped quest must fail; completing the active one still requires fresh GPS
and awards both balances only once.

Replacement validation: final full suite 195/195 backend tests passed with the
local Firestore emulator; 60/60 frontend tests, build and lint passed. The first
full run hit the previously observed transaction-lock retry exhaustion in an old
completion stress test; its isolated rerun and the subsequent full rerun passed.
A live Gemini/Places FastAPI smoke test with synthetic authentication and emulator
persistence assigned a quest in 1.70s and replaced it in 1.47s. The old record
became skipped; user and dorm XP stayed 0; the current-quest endpoint reloaded the
replacement. Synthetic documents were cleaned up; no production Firestore records
were changed. The restarted local API exposes the replacement endpoint.

## Integration with latest main (3d7051b)

This section supersedes the older preview-modal/manual-completion descriptions.
The merged app keeps main's new full-page generation and quest detail layout,
original-request display, map, Complete and confirmed Abandon controls. Generate
another now appears on the **quest detail page** and uses that same full-page
loading/error flow; the old preview modal is no longer the primary interface.

Replacement keeps the latest filters submitted from the quest board. After a
refresh it uses the server-saved `userRequest`. Older assignments without a
request snapshot fall back to the student's saved preferences/goals with any
location/time/budget. Return to the quest board to choose different filters.
Both normal and replacement generation now save the validated request snapshot,
so the detail page can display it and reuse it after refresh. The backend still
validates every incoming request and trusts no client UID/reward/destination.

Main's duration-based XP policy is preserved for **new** quests: 5 XP per started
15-minute block, minimum 5 and maximum 50. Existing quests keep their stored reward.
Assignment/replacement itself awards no XP. Radius remains configurable.

Main's completion/abandon deletion behavior is preserved: Complete checks fresh
GPS, atomically awards user and dorm XP, deletes the completed assignment and
clears its pointer. Replay of a deleted quest returns 404 with no additional XP.
Abandon deletes without XP. Generate another remains an atomic generate-first
swap, preserving the previous quest as skipped history without XP; completing a
skipped quest returns 409. Abandoning or completing during generation prevents a
stale replacement from resurrecting that assignment. Missing destination pointers
are repaired as on main, without exposing another user's records.

The adapted Gainesville/destination-first prompt and the Firebase-token/shared
credentials/single-CORS fixes are retained. Pending generation is aborted and
account-specific state reset when the user changes, including while retrieving
legacy preferences. All Git conflicts were resolved by combining behavior rather
than restoring the removed preview flow.

Manual check: refresh, choose filters and click Sidequest me. On the new detail
page click Generate another; expect a loading page, then a new quest detail page.
If generation fails, return to the quest board: the previous quest remains active.
Check the prior document is skipped and XP unchanged. New rewards depend on the
estimated duration. Complete with valid GPS/dorm to award both balances once and
remove that active document, or Abandon to remove it without XP.

Merged-main validation: 204/204 backend tests passed with local emulator
transactions, including completed/deleted quest replay, duration-based rewards,
Abandon-versus-replacement and completion-versus-replacement. 62/62 frontend tests,
production build and lint passed. New navigation tests exercise latest/saved
request selection, the detail-page Generate another button, error handling,
duplicate-action prevention and account changes during generation/preferences
loading. Test expectations preserve the rule that generating another assignment
never awards XP. No production Firestore records were modified.
