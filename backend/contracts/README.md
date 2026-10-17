# Quest assignment JSON contract

**Current handoff:** [TASK5_API.md](../TASK5_API.md). `/quests/assign` now returns
the saved response below (201 new / 200 reused), `/me/quest` reloads it, and the
fixed Step 3 test moved to `/quests/preview`. New saves require the real resolver.
`assignment.request.schema.json` now includes optional originCoordinates,
required with a distance limit. Historical stage notes below are superseded by
this API handoff.

Step 4 adds a direct Gemini `POST /quests/generate` preview (no quest catalog) and
`generation.request.schema.json` / `generation.preview.schema.json`; see
[`TASK4_GEMINI.md`](../TASK4_GEMINI.md). It accepts the same inputs plus optional
`originCoordinates` (required with a distance limit). The Step 3 contracts below
remain unchanged. Gemini generation is read-only until the persistence step. Its destination and any
requested distance stay explicitly unverified until the teammate resolver is connected.

The `POST /quests/assign` request matches the frontend team's example JSON.
The fixed-quest preview is now at `/quests/preview`; see
`backend/TASK3_INTEGRATION.md`. That test returns `QuestPreviewResponse` with `saved: false`; `/quests/assign`
returns the persisted `AssignQuestResponse` documented below.
These models introduce no Gemini calls, Firestore writes, or UI component changes.

`backend/quest_contracts.py` is the executable source. Regenerate schemas and test
from the repository root using an environment with the backend dependencies:

```sh
python -m backend.quest_contracts
python -m unittest backend.tests.test_quest_contracts -v
```

## Public request: frontend format

See `assignment.request.example.json` and `assignment.request.schema.json`.
`AssignQuestRequest` accepts this format, and `.normalize()` returns the backend's
`NormalizedQuestPreferences`. The frontend does not need to construct normalized
bounds or tagged location objects.

| Field | Meaning |
| --- | --- |
| `preferences` | General preference text, default empty, at most 4,000 characters |
| `username` | Optional display text, at most 160 characters; never authoritative identity |
| `location` | Address/place label; blank, `any`, or `Anywhere` means within the app's UF scope |
| `time` | `{selection, customMinutes}` for activity duration in minutes, excluding travel |
| `budget` | `{selection, customDollars}` for activity cost in USD |
| `distance` | Positive JSON number: maximum straight-line distance in miles from the location; null/omitted means no distance limit |
| `goals` | Default empty array; at most 20 nonblank strings, 500 characters each |
| `vibePreferences` | Selected vibe's preference text, default empty, at most 4,000 characters |

Example distance and duration filters can be supplied together:

```json
{
  "location": "101 Museum Rd, Gainesville, FL 32603, USA",
  "time": {"selection": "60", "customMinutes": null},
  "budget": {"selection": "0", "customDollars": null},
  "distance": 2.5
}
```

This requests an activity lasting at most 60 minutes, costing nothing, with a
venue within 2.5 miles of that search origin. Travel time is not deducted from
activity duration. Straight-line distance is not a promise about walking/driving
route length. The backend will convert miles to meters when filtering trusted
venue coordinates in the generation step; distance filtering is not wired yet.
An unresolved origin must not silently cause the filter to be ignored.

A non-null distance with no specific location is rejected: the server cannot
measure miles from `Anywhere`. Location labels are not trustworthy coordinates.
The later handler must resolve them before enforcing distance. Completion still
requires a fresh GPS reading and its separate accuracy/proximity checks.

The emailed example's Markdown address link is accepted by extracting only its
visible label. The normalizer never follows user-supplied URLs or infers GPS proof
from them. Plain address strings are preferred. The location string is limited
to 300 characters, including link formatting when present.

## Exact time and budget meanings

| UI selection | Backend interpretation |
| --- | --- |
| Time `any` or blank | No activity-duration constraint |
| Time `30` | Activity duration at most 30 minutes |
| Time `60` | Activity duration at most 60 minutes |
| Time `120` (**2+ hours**) | Activity duration at least 120 minutes, not a 120-minute maximum |
| Time `custom` | `customMinutes` is a positive whole number, used as an activity-duration maximum |
| Budget `any` or blank | No cost limit (cost remains nonnegative) |
| Budget `0` | Free |
| Budget `10` | Strictly under $10 |
| Budget `10-25` | Between $10 and $25, inclusive |
| Budget `custom` | `customDollars` is a nonnegative maximum; zero is valid |

Use null or omit custom values when they do not apply. Valid retained custom
values never override a different active selection. Custom selections require
the corresponding numeric value. An empty custom string is not zero. Numeric
strings, booleans, non-finite numbers, unknown selections, unknown fields, and
invalid bounds are rejected. `{}` for `time` or `budget` defaults to `any`;
`location`, `time`, and `budget` must be present. Text is trimmed.

The current controls and their labels need no changes for this contract. A future
request helper can send their raw selection strings instead of the preview's
human-readable descriptions. The frontend team owns adding its new distance
control and sending its chosen value as numeric miles (or null), independently
of activity duration. No such frontend work is done here.

## Identity and normalization

The future endpoint will require a verified Firebase ID token in
`Authorization: Bearer <token>`. The body cannot provide `uid`, `userId`, email,
dorm, XP, completion state, a Gemini key, or a raw system prompt. `username` is
accepted for frontend compatibility but deliberately omitted by normalization;
it must not select an account or overwrite the authenticated profile display
name. Gemini does not need a student's name to personalize activities.

Selected vibe preferences and general preferences remain separate. Blank vibe
text normalizes to no selected vibe; the request does not invent a vibe name.
Goals remain a list. Explicit controls win over any older saved vibe filters.

`assignment.normalized.schema.json` and `assignment.normalized.example.json`
describe backend-only constraints: a tagged search location, inclusive activity
`minMinutes`/`maxMinutes`, budget bounds (including an exclusive maximum for
Under $10), and `maxDistanceMiles`. Internal models also retain optional numeric
origin coordinates for later integration; the public frontend request does not
currently send them. This internal shape is not an alternate endpoint payload.

The schemas describe structural constraints. Pydantic additionally validates
relationships such as required custom values, distance needing a location,
ordered bounds, and matching saved-assignment IDs.

## Saved-assignment response

This is now the live persisted response for Step 5, separate from the fixed
preview response. Task 3 uses `assignment.preview.example.json` and
`assignment.preview.schema.json` and always returns HTTP 200 without saving.

See `assignment.response.example.json` and `assignment.response.schema.json`.
The example is illustrative, not a verified destination or a seeded quest.

- `quest` includes `id`, existing camelCase destination/XP fields, and the new
  display fields `steps`, `estimatedMinutes` (activity only, excluding travel),
  and `estimatedCostDollars`.
- `assignment` includes `id`, `userId`, `questId`, `status: "assigned"`, an
  RFC 3339 `assignedAt` timestamp with timezone, `completedAt: null`, and
  `xpAwarded: 0`. XP is awarded only on completion.
- `reusedExisting` is explicitly false for a new assignment and true when the
  student's already-active assignment is returned. An existing assignment may
  reflect older preferences; the frontend should identify it as the current
  quest instead of presenting it as a fresh generation.

Planned HTTP behavior: 201 after creating and persisting a new quest/assignment,
200 for an existing active assignment. Success must follow database persistence,
not merely receiving Gemini text. Invalid preference JSON will use FastAPI's
422 validation response. Provider failures must not create an assignment or
return a successful saved-assignment response.

Assignment `questId` must match `quest.id`, and assignment `id` must follow the
existing `{userId}_{questId}` convention. Timestamps serialize to ISO/RFC 3339
strings, never Firestore SDK objects. Response IDs and identity come from the
server, and destination coordinates/radius/XP must be attached from trusted
server data. Estimated time/cost are estimates; validation of the generated
quest against requested limits belongs in the generation step.

## Integration decisions retained for later steps

The frontend stores preferences/goals under `Users/{Clerk user ID}` and vibes
under `Users/{Clerk user ID}/vibes`; preserve those paths and existing fields.
Step 2 now provides a Clerk-to-Firebase identity bridge and updates completion to
read `Users`; see `backend/AUTH_SETUP.md` for configuration and frontend handoff.
Historical lowercase `users` documents are not migrated automatically.
The planned quest/assignment paths remain
`quests/{questId}` and `userQuests/{userId}_{questId}`. Embedded `id` fields in API
responses are document IDs, not a requirement to duplicate them in Firestore.

The new response fields do not migrate historical quest documents automatically.
Existing GET/completion response shapes remain unchanged. The persisted response
models will be wired to the handler in a later step, not applied globally to old
records or sent directly as Gemini's output schema. Gemini should supply creative
content and a permitted venue choice; the server supplies saved-assignment data.
