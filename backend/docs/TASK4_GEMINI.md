# Step 4: direct Gemini generation

`POST /quests/generate` verifies the Firebase ID token and UF account, accepts the
frontend preference JSON, and generates a new quest directly through Gemini.
There is no predefined quest catalog and no Firestore access in this flow.
The fixed Step 3 test is now `/quests/preview`. Step 5 adds saved assignments
at `/quests/assign`; see [TASK5_API.md](TASK5_API.md).

## Configuration

Put these in the ignored repository-root `.env` (the file loaded by FastAPI),
not `backend/.env` or the frontend `.env.local`. Restart FastAPI after changes.

```dotenv
GEMINI_API_KEY=your-key-from-google-ai-studio
GEMINI_MODEL=gemini-3.8-flash
GEMINI_TIMEOUT_SECONDS=20
```

No additional dependencies are required. The existing HTTP client calls Gemini's
REST API with structured JSON output, then Pydantic validates the result.
The default is `gemini-3.8-flash` for generation and photo review. Gemini 3
requests use LOW thinking; the model remains configurable. Requests use a
compact, shared mission-design prompt and a 3,072-token output cap. It prioritizes
locally grounded new experiences, then user preferences and a safe surprise;
stops must have distinct purpose, while ordered actions may share a destination.
Actions and route length scale to the request, with a ten-step/ten-stop ceiling
and no fixed count. Multi-stop generation selects from a bounded, verified pool
of up to 20 candidate places, rather than trusting model-authored destinations.
The backend uses a reusable HTTP connection pool, closed at app shutdown.
The REST `responseFormat.text.mimeType` uses the `APPLICATION_JSON` enum.
The provider read timeout defaults to 20 seconds (configurable from 5 to 120);
the connection timeout remains 5 seconds. A short timeout limits stalls, not actual
response time. There are no automatic retries or cached/fabricated quest results.
The live API rejected `gemini-2.5-flash` for new users, so it is not used as fallback.

Credentials, Firebase tokens, UIDs, and `username` are not sent to Gemini.
The prompt includes the supplied preferences, goals, vibe, normalized time/budget,
location label, and distance limit. Exact numeric search coordinates stay on the
backend. Free text is treated as untrusted prompt data. No key, raw provider
error, or credential is returned to the frontend.

## Response and current boundary

The frontend receives `title`, `description`, `steps`, per-step `stepProofMethods`
and `stepDestinationIndexes`, `locationName`,
`locationAddress`, `estimatedMinutes`, and `estimatedCostDollars`. Internally Gemini
also returns `completionCriteria`; the backend formats that into the final
"You're done when ..." step and does not expose an extra frontend field. It cannot provide GPS coordinates,
XP rewards, IDs, completion state, or verification flags. Unexpected fields and
invalid/non-finite values are rejected.

The prompt keeps playful titles but asks for a literal objective, actionable steps,
and an observable "You're done when ..." ending. It avoids vague reflection as a
finish condition and forced academic metaphors. `location` and `photo` steps can
earn XP using their corresponding verification; photo proof is for visible,
assessable outcomes. `recreation` is fun-only and earns no XP. Requests allow
location, photo, or recreation, with recreation selected exclusively. The backend
validates Gemini's per-step choices against the selected options. Photos are reviewed
in memory and are not persisted; only accepted/skipped step indexes are saved.

Time and budget estimates are checked on the backend: `120` means at least 120
activity minutes, `30`/`60`/custom mean maximum minutes, and budget `10` means
strictly under $10. Travel time is excluded. These remain AI estimates, not
verified durations, prices, hours, events, or availability.

Without a configured destination resolver, success is an **unverified preview**
with:

```json
{
  "mode": "generated",
  "saved": false,
  "filtersApplied": false,
  "destinationVerified": false,
  "destination": null,
  "distanceStatus": "not_requested",
  "distanceMeters": null
}
```

With a distance limit, `distanceStatus` is `pending` instead. Such a preview
cannot be used for GPS completion or persisted as a verified assignment. Current
assignment generation requires the real resolver; see [TASK5_API.md](TASK5_API.md).

## Backend 1 handoff: destination resolver

Build your helper in a separate file, for example
`backend/quests/destination_resolver.py`.
The integration hook is `get_destination_resolver()` in
`backend/quests/quest_generation.py`;
coordinate wiring that hook before editing the generator. Proposed interface:

```python
from backend.quests.quest_contracts import ResolvedDestination
from backend.quests.quest_generation import DestinationResolutionError

def resolve_destination(location_name: str, location_address: str) -> ResolvedDestination:
    # Resolve using a trusted location provider. Reject unknown/ambiguous places.
    # Independently verify the actual coordinates lie within Gainesville city limits; an address
    # containing "UF" or "Gainesville" is not sufficient.
    # Return only after that check:
    return ResolvedDestination(
        locationName=canonical_name,
        latitude=verified_latitude,
        longitude=verified_longitude,
        placeId=provider_place_id,  # optional, defaults to None
        scope="gainesville_city",
    )
```

Raise `DestinationResolutionError()` for unresolved, ambiguous, inaccessible, or
out-of-scope results; raise `DestinationResolutionError(unavailable=True)` for
provider outages. Never silently fall back to Gemini coordinates. Keep resolver
credentials on the backend and do not change frontend components, XP code,
Firestore collections, or assignment persistence for this task.

The generator accepts a callable returning this model or a matching dictionary.
Once wired, its output is independently shape-validated. The response's
`destination` contains the canonical name/GPS/place ID and `destinationVerified`
is true. The proposed quest name/address stay labeled as Gemini content; use
`destination` for trusted location data.

With `distance` set, the request must include `originCoordinates` matching the
selected search location, plus a specific `location` label. The generator checks
Haversine distance against miles * 1609.344 without rounding before comparison.
An out-of-range resolved destination returns 409. A successful distance check
returns `distanceStatus: "verified"` and `distanceMeters`. With no distance limit,
status remains `not_requested`. Only resolved campus previews have
`filtersApplied: true`. Resolver failure returns an error, not an unverified
fallback. Search coordinates are client-reported and are not attendance proof.

## Frontend handoff and browser test

Only the service helper changed; no frontend component was edited. The team can
import `requestGeneratedQuest` from `src/services/questAssignment.ts` when wiring
its button and result display. That helper validates the new response flags and
optional resolved destination. `requestTestQuest` still calls the fixed test.

Keep both servers running, log in with a verified-email account, and run this in the
frontend browser console. Each call requests a generation and may consume quota.

```js
const { firebaseAuth } = await import('/src/configs/FirebaseConfig.ts');
const { requestGeneratedQuest } = await import('/src/services/questAssignment.ts');
const generated = await requestGeneratedQuest(firebaseAuth.currentUser.uid, {
  preferences: 'I enjoy programming and nature.',
  location: 'Anywhere',
  time: { selection: '60', customMinutes: null },
  budget: { selection: '0', customDollars: null },
  distance: null,
  goals: ['Learn Computer Science'],
  vibePreferences: 'Something relaxed'
}, { onTiming: (timing) => console.table(timing) });
console.log(generated);
```

Expect actual AI content and the unverified-preview flags above while the resolver
is pending. Nothing is saved and no XP changes. The normal button still uses the
frontend team's existing behavior until they wire the helper.

## Latency diagnostics

The optional `onTiming` callback reports `tokenMs` (browser Firebase token retrieval),
`requestMs` (HTTP request including response JSON), `totalMs` (their sum), and the
`serverTiming` header. The backend's `Server-Timing` stages are `auth`, `gemini`,
optional `resolver`, and `total`, all in milliseconds. CORS exposes that header.
Measurements contain no UID, token, key, prompt, or destination. Callback failures
do not change a successful quest result. No frontend component changes are needed.

Do not add `tokenMs` to server `total` to estimate client time: browser `totalMs`
already includes all stages. If browser time is high but server time is low, inspect
browser token retrieval and network timing. If `auth` is high, inspect Firebase;
if `gemini` is high, inspect the provider. Revocation and UF account checks remain
fully enabled. The resolver adds an external place-verification step; its latency
depends on provider response time and should be measured in the deployment
environment.

Errors: 401 invalid token, 403 unverified email, 409 resolved destination beyond the
distance limit, 422 invalid input, 429 provider quota, 502 invalid/blocked generated
content or failed destination verification, 503 provider configuration/outage,
and 504 timeout. The generator does not retry billable calls automatically.

Run automated tests without paid calls or production database writes:

```sh
python -m unittest discover -s backend/tests -q
cd Sidequester_Frontend
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

References: [REST API](https://ai.google.dev/api/generate-content),
[structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
[API key setup](https://ai.google.dev/gemini-api/docs/api-key).
